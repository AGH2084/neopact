"use client";
import { useState, type FormEvent } from "react";
import { ArrowLeftRight, ArrowRight, Package, ShieldCheck } from "lucide-react";
import { Brand } from "./brand";

export function LoginPage({
  error,
  busy,
  onSignIn,
}: {
  error: string;
  busy: boolean;
  onSignIn: (email: string, password: string) => Promise<boolean>;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await onSignIn(email, password)) setPassword("");
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand-row">
          <Brand inverse />
          <span>Business, in agreement.</span>
        </div>
        <div className="login-proposition">
          <h1>
            Terms aligned.
            <br />
            <span>Business moving.</span>
          </h1>
          <p>Your agents negotiate. Your business decides.</p>
          <ol className="agreement-flow" aria-label="How agreements work">
            <li>
              <Package size={20} aria-hidden="true" />
              <div>
                <strong>Find the right fit</strong>
                <span>Products, requirements and supplier matches.</span>
              </div>
            </li>
            <li>
              <ArrowLeftRight size={20} aria-hidden="true" />
              <div>
                <strong>Bring the terms together</strong>
                <span>Follow offers and guide your agent privately.</span>
              </div>
            </li>
            <li>
              <ShieldCheck size={20} aria-hidden="true" />
              <div>
                <strong>Make the final call</strong>
                <span>Both businesses approve the exact offer.</span>
              </div>
            </li>
          </ol>
        </div>
        <div className="login-footer">
          <span>Built for business-to-business commerce.</span>
          <span>Human approval, always.</span>
        </div>
      </section>
      <section className="login-form-wrap">
        <form onSubmit={submit}>
          <h2>Your next agreement starts here.</h2>
          <p>Sign in to follow your agents and review proposed deals.</p>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          <label>
            Email address
            <input
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="button primary wide" disabled={busy}>
            {busy ? "Signing in…" : "Open workspace"}
            <ArrowRight size={18} />
          </button>
          <div className="login-note">
            <ShieldCheck size={20} />
            <p>
              Agent credentials are separate from your account. Only authorized
              people can approve a deal.
            </p>
          </div>
        </form>
      </section>
    </main>
  );
}
