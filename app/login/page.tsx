import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Sign in — Data Mng",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
