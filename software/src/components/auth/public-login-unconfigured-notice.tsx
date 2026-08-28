export function PublicLoginUnconfiguredNotice() {
  return (
    <div
      data-testid="public-login-unconfigured"
      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-100/90"
    >
      <p className="font-medium text-amber-50">Online sign-in is not configured yet</p>
      <p className="mt-1 text-amber-100/70">
        This build has no authentication website address, so the desktop app cannot open a browser
        sign-in. Public authentication stays in the browser once that address is provided. Google and
        GitHub login are not offered.
      </p>
    </div>
  );
}
