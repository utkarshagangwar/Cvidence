import { htmlToText } from "../text";
import type { SourceAdapter } from "../types";
import { arr, isObj, items, looksRemote, seg, str } from "./util";

// api.lever.co/v0/postings/{slug}?mode=json
// `createdAt` is epoch milliseconds. The description is split across
// descriptionPlain, `lists` (HTML sections) and additionalPlain, so they're joined.
export const lever: SourceAdapter = {
  id: "lever",
  label: "Lever",
  request: (source) => ({ url: `https://api.lever.co/v0/postings/${seg(source.slug)}?mode=json` }),
  parse(body, source) {
    return {
      postings: items(body).map((j) => {
        const cat = isObj(j.categories) ? j.categories : {};
        const location = str(cat.location) || arr(cat.allLocations).map(str).filter(Boolean).join(", ");
        const lists = items(j, "lists")
          .map((l) => [str(l.text), htmlToText(str(l.content))].filter(Boolean).join("\n"))
          .filter(Boolean);
        const description = [str(j.descriptionPlain) || htmlToText(str(j.description)), ...lists, str(j.additionalPlain)]
          .map((s) => s.trim())
          .filter(Boolean)
          .join("\n\n");
        const workplace = str(j.workplaceType).toLowerCase();
        const salary = isObj(j.salaryRange)
          ? [str(j.salaryRange.currency), [str(j.salaryRange.min), str(j.salaryRange.max)].filter(Boolean).join("-"), str(j.salaryRange.interval)]
              .filter(Boolean)
              .join(" ")
          : "";
        return {
          externalId: str(j.id),
          title: str(j.text),
          company: source.company,
          location,
          remote: workplace === "remote" ? true : workplace === "onsite" || workplace === "hybrid" ? false : looksRemote(location) || null,
          employmentType: str(cat.commitment),
          salary,
          url: str(j.hostedUrl),
          description,
          postedAt: typeof j.createdAt === "number" ? j.createdAt : null,
        };
      }),
    };
  },
};
