import "next-auth";

declare module "next-auth" {
  interface Session {
    provider?: string;
    provider_id?: string;
  }
}
