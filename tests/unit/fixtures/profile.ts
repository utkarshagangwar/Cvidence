import type { ProfileDoc } from "@/lib/profile/schema";

// A realistic early-career QA profile (the Casefile example), with fixed ids.
export const SKILL = {
  selenium: "00000000-0000-4000-8000-000000000101",
  python: "00000000-0000-4000-8000-000000000102",
  robot: "00000000-0000-4000-8000-000000000103",
  playwright: "00000000-0000-4000-8000-000000000104",
  actions: "00000000-0000-4000-8000-000000000105",
  postman: "00000000-0000-4000-8000-000000000106",
  sql: "00000000-0000-4000-8000-000000000107",
};
export const EXP = { northwind: "00000000-0000-4000-8000-000000000201", lumen: "00000000-0000-4000-8000-000000000202" };
export const PROJ = { ci: "00000000-0000-4000-8000-000000000301", smoke: "00000000-0000-4000-8000-000000000302" };

export function riya(): ProfileDoc {
  return {
    basics: {
      name: "Riya Sharma",
      headline: "QA Automation Engineer",
      city: "Bengaluru",
      phone: "+91 98450 12345",
      summary: "QA engineer with manual and automated testing across logistics and edtech products, building Selenium and Robot Framework suites in Python.",
      email: "riya@example.com",
      links: [{ label: "LinkedIn", url: "https://linkedin.com/in/riya-sharma" }],
    },
    languages: [{ name: "English", level: "Fluent" }, { name: "Hindi", level: "Native" }],
    experiences: [
      {
        id: EXP.northwind,
        company: "Northwind Logistics",
        title: "QA Engineer",
        location: "Bengaluru",
        startDate: "2025-04",
        endDate: "",
        bullets: [
          { id: "00000000-0000-4000-8000-000000000401", text: "Built a Selenium WebDriver and Python suite on the Page Object Model for the shipment-tracking web app." },
          { id: "00000000-0000-4000-8000-000000000402", text: "Wrote Robot Framework keyword libraries reused by 3 product teams." },
          { id: "00000000-0000-4000-8000-000000000403", text: "Run smoke and regression passes before each fortnightly release." },
        ],
        skillIds: [SKILL.selenium, SKILL.python, SKILL.robot],
      },
      {
        id: EXP.lumen,
        company: "Lumen Edtech",
        title: "QA Intern",
        location: "Bengaluru",
        startDate: "2024-10",
        endDate: "2025-03",
        bullets: [{ id: "00000000-0000-4000-8000-000000000404", text: "Executed manual functional and UI test cases for the course player." }],
        skillIds: [],
      },
    ],
    projects: [
      {
        id: PROJ.ci,
        name: "Interview platform CI pipeline",
        url: "",
        description: "Ran Robot Framework suites on every pull request with GitHub Actions.",
        startDate: "",
        endDate: "",
        bullets: [],
        skillIds: [SKILL.robot, SKILL.actions],
      },
      {
        id: PROJ.smoke,
        name: "Playwright smoke pack",
        url: "",
        description: "Wrote a 30-test smoke pack for a sign-up and checkout flow, run nightly.",
        startDate: "",
        endDate: "",
        bullets: [],
        skillIds: [SKILL.playwright],
      },
    ],
    education: [{ id: "00000000-0000-4000-8000-000000000501", institution: "RV College of Engineering", degree: "B.E.", field: "Computer Science", grade: "", startDate: "2020-08", endDate: "2024-06" }],
    certifications: [],
    skills: [
      { id: SKILL.selenium, name: "Selenium WebDriver", group: "Technical" },
      { id: SKILL.python, name: "Python", group: "Technical" },
      { id: SKILL.robot, name: "Robot Framework", group: "Technical" },
      { id: SKILL.playwright, name: "Playwright", group: "Technical" },
      { id: SKILL.actions, name: "GitHub Actions", group: "Tools" },
      { id: SKILL.postman, name: "Postman", group: "Tools" },
      { id: SKILL.sql, name: "SQL", group: "Technical" },
    ],
  };
}
