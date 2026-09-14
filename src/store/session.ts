import { create } from "zustand";
import type { Staff } from "@/lib/types";

const KEY = "mdede.staffToken";

function readToken() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

type SessionState = {
  token: string;
  staff: Staff | null;
  setSession: (token: string, staff: Staff) => void;
  clearSession: () => void;
  hydrate: () => void;
};

export const useStaffSession = create<SessionState>((set) => ({
  token: "",
  staff: null,
  setSession: (token, staff) => {
    try {
      window.localStorage.setItem(KEY, token);
    } catch {
      /* ignore */
    }
    set({ token, staff });
  },
  clearSession: () => {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    set({ token: "", staff: null });
  },
  hydrate: () => set({ token: readToken() }),
}));
