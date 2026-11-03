/**
 * ATS Resume Builder - Backend API Server
 * Vercel Serverless Function (Express)
 * * This server acts as a secure proxy between the frontend and OpenRouter API.
 * The API key is stored in Vercel environment variables, never exposed to the client.
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config(); // Load .env for local testing

const app = express();
const PORT = process.env.PORT || 3001;

// =============================================================================
// CONFIGURATION
// =============================================================================

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Security headers
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS - Allow all origins for Vercel deployment
// We use 'origin: true' to ensure mobile/web/previews all work without issues.
app.use(cors({
    origin: true, 
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Parse JSON bodies (limit increased for large resume text)
app.use(express.json({ limit: '5mb' }));

// Rate limiting - 100 requests per 15 minutes per IP
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        error: 'Too many requests from this IP, please try again after 15 minutes',
        retryAfter: 15
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to all API routes
app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// =============================================================================
// INPUT VALIDATION HELPERS
// =============================================================================

function validateChatRequest(body) {
    const errors = [];
    
    if (!body.messages || !Array.isArray(body.messages)) {
        errors.push('messages must be an array');
    } else if (body.messages.length === 0) {
        errors.push('messages array cannot be empty');
    } else {
        body.messages.forEach((msg, index) => {
            if (!msg.role || !['system', 'user', 'assistant'].includes(msg.role)) {
                errors.push(`messages[${index}].role must be 'system', 'user', or 'assistant'`);
            }
            if (!msg.content || typeof msg.content !== 'string') {
                errors.push(`messages[${index}].content must be a non-empty string`);
            }
            if (msg.content && msg.content.length > 50000) {
                errors.push(`messages[${index}].content exceeds maximum length of 50000 characters`);
            }
        });
    }
    
    if (body.model && typeof body.model !== 'string') {
        errors.push('model must be a string');
    }
    
    // Validate temperature if present
    if (body.temperature !== undefined) {
        if (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2) {
            errors.push('temperature must be a number between 0 and 2');
        }
    }
    
    // Validate max_tokens if present
    if (body.max_tokens !== undefined) {
        if (!Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 4000) {
            errors.push('max_tokens must be an integer between 1 and 4000');
        }
    }
    
    return errors;
}

// =============================================================================
// API ROUTES
// =============================================================================

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        apiConfigured: !!OPENROUTER_API_KEY && OPENROUTER_API_KEY.length > 10
    });
});

/**
 * Test API connection and get available models
 */
app.get('/api/models', async (req, res) => {
    if (!OPENROUTER_API_KEY) {
        return res.status(500).json({
            error: 'API key not configured on server',
            code: 'API_KEY_MISSING'
        });
    }

    try {
        const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            return res.status(response.status).json({
                error: error.error?.message || 'Failed to fetch models',
                code: 'OPENROUTER_ERROR'
            });
        }
        
        const data = await response.json();
        const models = data.data || [];
        
        // Sort models: free first, then alphabetically
        const sortedModels = models.sort((a, b) => {
            const aFree = a.id.includes(':free') || (a.pricing?.prompt === '0' && a.pricing?.completion === '0');
            const bFree = b.id.includes(':free') || (b.pricing?.prompt === '0' && b.pricing?.completion === '0');
            if (aFree && !bFree) return -1;
            if (!aFree && bFree) return 1;
            return (a.name || a.id).localeCompare(b.name || b.id);
        });
        
        // Return processed models (limit to 50 for performance)
        const processedModels = sortedModels.slice(0, 50).map(m => ({
            id: m.id,
            name: m.name || m.id,
            isFree: m.id.includes(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0')
        }));
        
        res.json({
            success: true,
            models: processedModels,
            totalCount: models.length
        });
        
    } catch (error) {
        console.error('Error fetching models:', error);
        res.status(500).json({
            error: 'Failed to connect to OpenRouter API',
            code: 'CONNECTION_ERROR'
        });
    }
});

/**
 * Chat completion endpoint - proxies requests to OpenRouter
 */
app.post('/api/chat', async (req, res) => {
    if (!OPENROUTER_API_KEY) {
        return res.status(500).json({
            error: 'API key not configured on server',
            code: 'API_KEY_MISSING'
        });
    }

    // Validate request body
    const validationErrors = validateChatRequest(req.body);
    if (validationErrors.length > 0) {
        return res.status(400).json({
            error: 'Invalid request',
            details: validationErrors,
            code: 'VALIDATION_ERROR'
        });
    }
    
    try {
        const { messages, model, temperature = 0.6, max_tokens = 1000 } = req.body;
        
        // Use provided model or default to a free model
        const selectedModel = model || 'meta-llama/llama-3.1-8b-instruct:free';
        
        console.log(`[Chat] Using model: ${selectedModel}`);
        
        const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
                'X-Title': 'ATS Resume Builder'
            },
            body: JSON.stringify({
                model: selectedModel,
                messages,
                temperature,
                max_tokens
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            console.error('OpenRouter error:', error);
            return res.status(response.status).json({
                error: error.error?.message || 'AI request failed',
                code: 'OPENROUTER_ERROR'
            });
        }
        
        const data = await response.json();
        
        console.log(`[Chat] Response received successfully`);
        
        res.json({
            success: true,
            content: data.choices?.[0]?.message?.content || '',
            model: selectedModel,
            usage: data.usage
        });
        
    } catch (error) {
        console.error('Chat endpoint error:', error);
        res.status(500).json({
            error: 'Failed to process AI request',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * Resume parsing endpoint - uses AI to parse resume text
 */
app.post('/api/parse-resume', async (req, res) => {
    if (!OPENROUTER_API_KEY) {
        return res.status(500).json({
            error: 'API key not configured on server',
            code: 'API_KEY_MISSING'
        });
    }

    const { text, model } = req.body;
    
    if (!text || typeof text !== 'string') {
        return res.status(400).json({
            error: 'Resume text is required',
            code: 'VALIDATION_ERROR'
        });
    }
    
    if (text.length > 100000) {
        return res.status(400).json({
            error: 'Resume text exceeds maximum length',
            code: 'VALIDATION_ERROR'
        });
    }
    
    try {
        const selectedModel = model || 'meta-llama/llama-3.1-8b-instruct:free';
        
        const systemMessage = `You are a precise resume parser. You extract structured data from resume text and return valid JSON only. You follow instructions exactly.`;

        const userMessage = `Parse this resume and extract all information into JSON format.

=== RESUME TEXT ===
${text.substring(0, 12000)}
=== END RESUME TEXT ===

EXTRACT AND RETURN THIS EXACT JSON STRUCTURE:

{
    "name": "Full Name from resume",
    "email": "email@domain.com",
    "phone": "phone number",
    "location": "City, State",
    "linkedin": "linkedin URL if present",
    "portfolio": "website URL if present",
    "summary": "Professional summary paragraph if present",
    "experience": [
        {
            "title": "Exact Job Title",
            "company": "Company Name",
            "dates": "Start - End dates",
            "location": "Job location",
            "bullets": "• bullet 1\\n• bullet 2\\n• bullet 3"
        }
    ],
    "education": [
        {
            "degree": "Degree Type and Field (e.g., Bachelor of Science in Computer Science)",
            "school": "Institution Name (e.g., Stanford University)",
            "dates": "Year or date range",
            "details": "GPA, honors if present"
        }
    ],
    "skills": {
        "technical": "comma-separated technical skills",
        "soft": "comma-separated soft skills",
        "tools": "comma-separated tools"
    },
    "projects": [
        {
            "name": "Project name",
            "tech": "Technologies",
            "description": "Brief description"
        }
    ],
    "certifications": [
        {
            "name": "Certification name",
            "issuer": "Issuer",
            "date": "Date"
        }
    ]
}

RULES:
1. "degree" = degree type + field of study (NOT school name)
2. "school" = institution name only
3. Extract ALL work experiences found
4. Keep bullet points as-is with • prefix
5. Return ONLY the JSON, no explanations
6. If a field is not found, use empty string ""

OUTPUT: Valid JSON only, nothing else.`;

        const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
                'X-Title': 'ATS Resume Builder'
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.3,
                max_tokens: 2000
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            return res.status(response.status).json({
                error: error.error?.message || 'AI parsing failed',
                code: 'OPENROUTER_ERROR'
            });
        }
        
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                res.json({
                    success: true,
                    data: parsed,
                    method: 'ai'
                });
            } catch (parseError) {
                res.status(422).json({
                    error: 'Failed to parse AI response as JSON',
                    code: 'PARSE_ERROR',
                    rawContent: content
                });
            }
        } else {
            res.status(422).json({
                error: 'AI response did not contain valid JSON',
                code: 'PARSE_ERROR',
                rawContent: content
            });
        }
        
    } catch (error) {
        console.error('Parse resume error:', error);
        res.status(500).json({
            error: 'Failed to parse resume',
            code: 'SERVER_ERROR'
        });
    }
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found', code: 'NOT_FOUND' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: 'CORS not allowed', code: 'CORS_ERROR' });
    }
    
    res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' });
});

// =============================================================================
// SERVER START (Local & Vercel)
// =============================================================================

// 1. If running LOCALLY (e.g. node api/index.js), this block runs and opens port 3001
if (require.main === module) {
    app.listen(PORT, () => {
        console.log('═'.repeat(50));
        console.log('🚀 ATS Resume Builder API Server (Local Mode)');
        console.log('═'.repeat(50));
        console.log(`📡 Server running on: http://localhost:${PORT}`);
        console.log(`🔒 API Key configured: ${OPENROUTER_API_KEY ? 'Yes ✓' : 'No ✗'}`);
        console.log('═'.repeat(50));
    });
}

// 2. If running on VERCEL, this export is used to start the serverless function
module.exports = app;