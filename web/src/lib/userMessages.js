import { flattenError } from "./walletErrors.js";
import { isBbWasmAbort } from "./browser.js";

function blobOf(error) {
  const msg = error?.message || (typeof error === "string" ? error : "");
  const stack = error?.stack || "";
  return `${flattenError(error)} ${msg} ${stack}`;
}

function looksTechnical(text) {
  return /AVM simulation|UNRECOVERABLE ERROR|C\+\+ simulation|siloed nullifier|wasm-function|throw_or_abort/i.test(
    text,
  );
}

/** Shorten hex so a dump cannot blow out mobile layout. */
export function softenTechnicalText(text, max = 220) {
  const cleaned = String(text || "")
    .replace(/0x[0-9a-fA-F]{16,}/g, (hex) => `${hex.slice(0, 10)}…`)
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max).trim()}…`;
}

/**
 * @param {unknown} error
 * @param {"vote" | "connect" | "generic"} [context]
 * @returns {{ title: string, text: string, code?: string }}
 */
export function explainError(error, context = "generic") {
  const msg = error?.message || String(error || "");
  const stack = error?.stack || "";
  const blob = blobOf(error);

  if (isBbWasmAbort(msg) || isBbWasmAbort(stack) || isBbWasmAbort(blob)) {
    return {
      title: "This browser ran out of memory",
      text: "Close extra tabs and retry, or continue from a desktop browser. iPhone often hits this during proving.",
    };
  }

  if (context === "vote") {
    if (/wrong vote period/i.test(blob)) {
      return {
        title: "This ballot is for the wrong day",
        text: "Daily polls use UTC days. Refresh and vote again.",
      };
    }
    if (/identity already voted/i.test(blob)) {
      return {
        code: "already_voted",
        title: "This identity already voted",
        text: "This ZKPassport identity already has a ballot in the current vote window.",
      };
    }
    if (
      /nullifier collision|duplicate siloed nullifier|r_nullifier_insertion|existing nullifier|already voted/i.test(
        blob,
      )
    ) {
      return {
        code: "already_voted",
        title: "You already voted",
        text: "This account already cast a ballot in the current vote window.",
      };
    }
    if (/zkpassport identity required|uniqueidentifier required/i.test(blob)) {
      return {
        title: "Identity check required",
        text: "Verify with ZKPassport before casting a ballot on this poll.",
      };
    }
    if (/identity not allowed for open polls/i.test(blob)) {
      return {
        title: "Open poll does not use identity",
        text: "This poll is open eligibility — vote without a ZKPassport commitment.",
      };
    }
    if (/authorizeutilitycall|cross-contract utility/i.test(blob)) {
      return {
        title: "This wallet cannot prove here",
        text: "Reconnect with Browser session. Demo Wallet and some extensions cannot authorize this prove step yet.",
      };
    }
    if (looksTechnical(blob)) {
      return {
        title: "The network rejected this ballot",
        text: "If you already voted, you cannot vote again. Otherwise tap Refresh and try once more.",
      };
    }
    return {
      title: "Could not cast the ballot",
      text: softenTechnicalText(msg) || "Try Refresh, then vote again.",
    };
  }

  if (context === "connect") {
    if (/popup was blocked|wallet popup|window\.open/i.test(blob)) {
      return {
        title: "Wallet popup blocked",
        text: "Allow popups for this site, then connect again.",
      };
    }
    if (/connection cancelled|user rejected|user denied/i.test(blob)) {
      return {
        title: "Connection cancelled",
        text: "Connect again when you are ready.",
      };
    }
    if (/no account on the current testnet/i.test(blob)) {
      return {
        title: "No account on this network",
        text: softenTechnicalText(msg) || "Switch network or create an Aztec account, then reconnect.",
      };
    }
    if (/existing nullifier/i.test(blob) && !/r_nullifier_insertion|nullifier collision/i.test(blob)) {
      return {
        title: "Account already on-chain",
        text: "This admin account is already deployed. Refresh and import the keys again — deploy is skipped automatically.",
      };
    }
    if (/failed to fetch|networkerror|load failed/i.test(blob)) {
      return {
        title: "Network blocked a required file",
        text: "Check connectivity and ad blockers. The prover needs the CRS CDN (crs.aztec-cdn.foundation).",
      };
    }
    if (/authorizeutilitycall|cross-contract utility/i.test(blob)) {
      return {
        title: "Try Browser session",
        text: "This external wallet cannot complete the handshake for voting. Use Browser session instead.",
      };
    }
    if (looksTechnical(blob)) {
      return {
        title: "Could not connect",
        text: "Retry Browser session. If this keeps happening, reload the page and connect again.",
      };
    }
    return {
      title: "Could not connect",
      text: softenTechnicalText(msg) || "Retry connecting your wallet.",
    };
  }

  if (looksTechnical(blob)) {
    return {
      title: "Something went wrong",
      text: "The action was rejected. Retry, or refresh the page if it happens again.",
    };
  }
  return {
    title: "Something went wrong",
    text: softenTechnicalText(msg) || "Retry this action.",
  };
}
