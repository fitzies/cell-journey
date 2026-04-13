import { Button } from "@/components/ui/button";

export default function SignInPage() {
  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Logo / wordmark */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center">
            <span className="text-background font-semibold text-sm">CJ</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Cell Journey</h1>
          <p className="text-sm text-muted-foreground">
            COSBT Cell Group Attendance
          </p>
        </div>

        {/* Auth buttons */}
        <div className="w-full flex flex-col gap-3">
          <Button className="w-full h-11 gap-2" variant="outline">
            <GoogleIcon />
            Continue with Google
          </Button>
          <Button className="w-full h-11 gap-2" variant="outline">
            <FacebookIcon />
            Continue with Facebook
          </Button>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M15.68 8.18c0-.57-.05-1.11-.14-1.64H8v3.1h4.3a3.67 3.67 0 0 1-1.6 2.41v2h2.58c1.51-1.39 2.4-3.44 2.4-5.87Z"
        fill="#4285F4"
      />
      <path
        d="M8 16c2.16 0 3.97-.72 5.3-1.94l-2.59-2a4.77 4.77 0 0 1-7.1-2.5H1v2.07A8 8 0 0 0 8 16Z"
        fill="#34A853"
      />
      <path
        d="M3.61 9.56A4.8 4.8 0 0 1 3.36 8c0-.54.1-1.07.25-1.56V4.37H1A8 8 0 0 0 0 8c0 1.29.31 2.51.86 3.59l2.75-2.03Z"
        fill="#FBBC05"
      />
      <path
        d="M8 3.18c1.22 0 2.31.42 3.17 1.24l2.37-2.37A7.94 7.94 0 0 0 8 0 8 8 0 0 0 1 4.37l2.75 2.07A4.77 4.77 0 0 1 8 3.18Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M16 8a8 8 0 1 0-9.25 7.9V10.3H4.72V8h2.03V6.24c0-2 1.19-3.1 3-3.1.88 0 1.8.16 1.8.16v1.98h-1.01c-1 0-1.3.62-1.3 1.25V8h2.22l-.35 2.3H9.25V15.9A8 8 0 0 0 16 8Z"
        fill="#1877F2"
      />
    </svg>
  );
}
