import { redirect } from "next/navigation";

// 루트 접속 시 /projects로 이동 (미들웨어가 로그인 여부를 판단해 /login으로 보냄)
export default function RootPage() {
  redirect("/projects");
}
