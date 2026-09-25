import * as React from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout, AuthHeader, AuthFooter } from "@/components/layout/auth-layout";
import { Button, Input, Label } from "@/components/ui";
import { toast } from "@/hooks/use-toast";
import { useSEO, SEO_CONFIGS } from "@/hooks/useSEO";
import { getSafeRedirect } from "@/lib/auth-redirect";
import { supabase } from "@/lib/supabase";
import { useSupabaseSession } from "@/hooks/use-supabase-session";

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  if (supabase) return <SupabaseLoginPage />;

  return <LegacyLoginPage />;
}

function SupabaseLoginPage() {
  const navigate = useNavigate();
  const redirect = React.useMemo(getSafeRedirect, []);
  const { session } = useSupabaseSession();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!session) return;
    if (redirect) void navigate({ href: redirect, replace: true });
    else void navigate({ to: "/app", replace: true });
  }, [navigate, redirect, session]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError || !data.session) {
        setError("Не удалось войти. Проверьте почту и пароль.");
        return;
      }

      // Do not wait for the auth-state subscription here. A full navigation
      // reads the persisted Supabase session on /app and avoids a race between
      // the subscription callback and TanStack Router's transition.
      window.location.replace(redirect || "/app");
    } catch {
      setError("Не удалось подключиться к сервису входа. Попробуйте ещё раз.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <AuthHeader
        title="Войти в планнер"
        description="Используйте почту и пароль для входа."
      />
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Почта</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect="off"
            disabled={isLoading}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Пароль</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            disabled={isLoading}
            required
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          type="submit"
          disabled={isLoading || !email || !password}
          className="mt-2 h-10 w-full text-[13px]"
        >
          {isLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Войти
        </Button>
      </form>
    </AuthLayout>
  );
}

function LegacyLoginPage() {
  useSEO(SEO_CONFIGS.login);
  const navigate = useNavigate();
  const redirect = React.useMemo(getSafeRedirect, []);
  const goNext = React.useCallback(() => {
    if (redirect) void navigate({ href: redirect, replace: true });
    else void navigate({ to: "/app" });
  }, [navigate, redirect]);
  const { login, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = React.useState(false);
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  // Redirect if already authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      goNext();
    }
  }, [isAuthenticated, goNext]);

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      await login(data);
      goNext();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description:
          error instanceof Error ? error.message : "Invalid credentials",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <AuthHeader
        title="Sign in"
        description="Enter your email and password"
      />

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect="off"
            disabled={isLoading}
            {...register("email", {
              required: "Email is required",
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: "Invalid email address",
              },
            })}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            disabled={isLoading}
            {...register("password", {
              required: "Password is required",
              minLength: {
                value: 6,
                message: "Password must be at least 6 characters",
              },
            })}
          />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        <Button type="submit" disabled={isLoading} className="w-full mt-2 h-9 text-[13px]">
          {isLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Sign in
        </Button>
      </form>

      <AuthFooter>
        Don&apos;t have an account?{" "}
        <Link
          to="/register"
          search={redirect ? { redirect } : undefined}
          className="text-foreground hover:underline underline-offset-4"
        >
          Sign up
        </Link>
      </AuthFooter>
    </AuthLayout>
  );
}
