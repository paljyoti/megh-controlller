import { SwitchNode, CloudNode, HostNode } from "./nodes";
import LinkEdge from "./LinkEdge";

// Passed to <ReactFlow nodeTypes/edgeTypes>. Defined once at module level (not inline in the
// page) so React Flow doesn't see a new object every render.
export const nodeTypes = { switch: SwitchNode, cloud: CloudNode, host: HostNode };
export const edgeTypes = { link: LinkEdge };
