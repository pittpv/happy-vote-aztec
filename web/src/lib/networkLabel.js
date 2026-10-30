/** Public protocol label. Stable 6.0.0 on Testnet and Mainnet. */
export const NETWORK_VERSION_LABEL = "v6";

const NODE_URL = import.meta.env.VITE_AZTEC_NODE_URL || "";

export function networkPlace(nodeUrl = NODE_URL) {
  const url = String(nodeUrl);
  if (!url || url.includes("localhost") || url.includes("127.0.0.1")) return "local";
  if (url.includes("mainnet")) return "mainnet";
  return "testnet";
}

/** Vote-page value next to the Network label, e.g. "testnet v6". */
export function networkHeading(nodeUrl = NODE_URL) {
  const place = networkPlace(nodeUrl);
  if (place === "local") return "local";
  return `${place} ${NETWORK_VERSION_LABEL}`;
}

/** Footer line under the Aztec links. */
export function footerNetworkLabel(nodeUrl = NODE_URL) {
  const place = networkPlace(nodeUrl);
  if (place === "local") return "Local";
  if (place === "mainnet") return `Mainnet ${NETWORK_VERSION_LABEL}`;
  return `Testnet ${NETWORK_VERSION_LABEL}`;
}
