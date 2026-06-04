import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@/lib/auth";
import { setTokenCookie, clearTokenCookie } from "@/lib/auth";

interface AuthStore {
  user: AuthUser | null;
  token: string | null;
  setAuth: (user: AuthUser, token: string) => void;
  logout: () => void;
  isLoggedIn: () => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,

      setAuth: (user, token) => {
        setTokenCookie(token);
        set({ user, token });
      },

      logout: () => {
        clearTokenCookie();
        set({ user: null, token: null });
      },

      isLoggedIn: () => !!get().token,
    }),
    {
      name: "moneta-auth",
    }
  )
);
