import { htmlToText } from "../text";
import type { SourceAdapter } from "../types";
import { isObj, items, seg, str } from "./util";

// api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true
// Jobs with isListed: false are hidden on the company's own page, so they're skipped.
export const ashby: SourceAdapter = {
  id: "ashby",
  label: "Ashby",
  request: (source) => ({ url: `https://api.ashbyhq.com/posting-api/job-board/${seg(source.slug)}?includeCompensation=true` }),
  parse(body, source) {
    return {
      postings: items(body, "jobs")
        .filter((j) => j.isListed !== false)
        .map((j) => {
          const extra = items(j, "secondaryLocations").map((l) => str(l.location)).filter(Boolean);
          const comp = isObj(j.compensation) ? str(j.compensation.compensationTierSummary) : "";
          return {
            externalId: str(j.id),
            title: str(j.title),
            company: source.company,
            location: [str(j.location), ...extra].filter(Boolean).join(", "),
            remote: typeof j.isRemote === "boolean" ? j.isRemote : null,
            employmentType: str(j.employmentType).replace(/([a-z])([A-Z])/g, "$1 $2"),
            salary: comp,
            url: str(j.jobUrl),
            description: str(j.descriptionPlain) || htmlToText(str(j.descriptionHtml)),
            postedAt: str(j.publishedAt) || null,
          };
        }),
    };
  },
};
