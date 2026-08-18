import { Client } from "@opensearch-project/opensearch";

export const opensearch = new Client({
  node: "http://localhost:9200",
});