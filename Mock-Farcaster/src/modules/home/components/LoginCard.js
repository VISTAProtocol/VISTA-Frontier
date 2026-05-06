export default function LoginCard({
  currentUser,
  identifier,
  password,
  errorMessage,
  onIdentifierChange,
  onPasswordChange,
  onLogin,
  onLogout,
}) {
  return (
    <aside id="login" className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4">
      <h2 className="mb-4 text-xl font-semibold tracking-tight text-white">
        {currentUser ? "Welcome back" : "Login"}
      </h2>

      {currentUser ? (
        <div className="grid gap-3 rounded-xl border border-white/10 bg-black/40 p-4">
          <p className="text-base font-bold text-white">{currentUser.displayName}</p>
          <p className="font-mono text-sm text-emerald-400">{currentUser.handle}</p>
          <button
            type="button"
            onClick={onLogout}
            className="mt-1 rounded-xl bg-linear-to-br from-violet-500 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Logout Session
          </button>
        </div>
      ) : (
        <form className="grid gap-3" onSubmit={onLogin}>
          <label htmlFor="identifier" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Email
          </label>
          <input
            id="identifier"
            name="identifier"
            type="email"
            value={identifier}
            onChange={(event) => onIdentifierChange(event.target.value)}
            placeholder="wallet@address"
            autoComplete="email"
            required
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none ring-violet-300/40 placeholder:text-zinc-500 focus:ring-2"
          />

          <label htmlFor="password" className="mt-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="Sign message"
            autoComplete="current-password"
            required
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none ring-violet-300/40 placeholder:text-zinc-500 focus:ring-2"
          />

          {errorMessage ? <p className="text-sm text-rose-400">{errorMessage}</p> : null}

          <button
            type="submit"
            className="mt-1 rounded-xl bg-linear-to-br from-violet-500 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Login
          </button>

          <p className="text-xs leading-relaxed text-zinc-400">Wallet auth memakai challenge + signature, bukan password statis.</p>
        </form>
      )}
    </aside>
  );
}
