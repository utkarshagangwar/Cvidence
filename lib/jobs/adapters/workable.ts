import { htmlToText } from "../text";
import type { SourceAdapter } from "../types";
import { items, looksRemote, seg, str } from "./util";

// apply.workable.com/api/v1/widget/accounts/{slug}?details=true
// Workable rate-limits this endpoint quickly; the worker backs off on HTTP 429.
export const workable: SourceAdapter = {
  id: "workable",
  label: "Workable",
  request: (source) => ({ url: `https://apply.workable.com/api/v1/widget/accounts/${seg(source.slug)}?details=true` }),
  parse(body, source) {
    return {
      postings: items(body, "jobs").map((j) => {
        const first = items(j, "locations")[0];
        const location = [str(j.city) || str(first?.city), str(j.state) || str(first?.region), str(j.country) || str(first?.country)]
          .filter(Boolean)
          .join(", ");
        return {
          externalId: str(j.shortcode) || str(j.code) || str(j.id),
          title: str(j.title),
          company: source.company,
          location,
          remote: j.telecommuting === true ? true : looksRemote(location) ? true : null,
          employmentType: str(j.employment_type),
          url: str(j.url) || str(j.shortlink) || str(j.application_url),
          description: htmlToText(str(j.description)),
          postedAt: str(j.published_on) || str(j.created_at) || null,
        };
      }),
    };
  },
};
