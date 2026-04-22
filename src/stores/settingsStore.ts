import { create } from "zustand";
import { apiFetch } from "@/api/client";

export type CompanySettingsData = {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  website: string;
};

type SettingsState = {
  company: CompanySettingsData | null;
  loading: boolean;
  error: string | null;
  fetchCompany: () => Promise<void>;
  updateCompany: (data: CompanySettingsData) => void;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  company: null,
  loading: false,
  error: null,
  fetchCompany: async () => {
    // If we already have company and are not loading, skip fetching again unless necessary
    if (get().company) return; 

    set({ loading: true, error: null });
    try {
      const res = await apiFetch<{ data: CompanySettingsData }>("/api/v1/settings/company");
      set({ company: res.data, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },
  updateCompany: (data) => set({ company: data }),
}));
