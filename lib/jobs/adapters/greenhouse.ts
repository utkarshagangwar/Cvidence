import { htmlToText } from "../text";
import type { SourceAdapter } from "../types";
import { isObj, items, looksRemote, seg, str } from "./util";

// boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
// `content` is HTML that is itself entity-escaped (&lt;p&gt;), so it is decoded twice.
export const greenhouse: SourceAdapter = {
  id: "greenhouse",
  label: "Greenhouse",
  request: (source) => ({ url: `https://boards-api.greenhouse.io/v1/boards/${seg(source.slug)}/jobs?content=true` }),
  parse(body, source) {
    return {
      postings: items(body, "jobs").map((j) => {
        const location = isObj(j.location) ? str(j.location.name) : "";
        return {
          externalId: str(j.id),
          title: str(j.title),
          company: str(j.company_name) || source.company,
          location,
          remote: looksRemote(location) ? true : null,
          url: str(j.absolute_url),
          description: htmlToText(str(j.content), { escaped: true }),
          postedAt: str(j.first_published) || str(j.updated_at) || null,
        };
      }),
    };
  },
};
