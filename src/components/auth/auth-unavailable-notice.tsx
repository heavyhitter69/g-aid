export function AuthUnavailableNotice({
  title = "Sign-in is not available here",
}: {
  title?: string;
}) {
  return (
    <div
      data-testid="auth-unavailable"
      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90"
    >
      <p className="font-medium text-amber-50">{title}</p>
      <p className="mt-1 text-amber-100/70">
        This environment has no usable authentication project. Email and password forms are disabled
        instead of returning a generic error. Google and GitHub login are not offered.
      </p>
    </div>
  );
}
