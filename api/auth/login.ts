type VercelRequest = {
  body?: unknown;
  method?: string;
};

type VercelResponse = {
  status: (statusCode: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

function parseBody(body: unknown): LoginBody {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as LoginBody;
    } catch {
      return {};
    }
  }

  return body && typeof body === "object" ? (body as LoginBody) : {};
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    return response.status(405).json({ message: "Method not allowed" });
  }

  const { email, password } = parseBody(request.body);
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return response.status(400).json({ message: "Email and password are required" });
  }

  const projectUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!projectUrl || !anonKey) {
    return response.status(503).json({ message: "Authentication is not configured" });
  }

  try {
    const upstream = await fetch(`${projectUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        "X-Client-Info": "nplan-auth-proxy/1.0",
      },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    if (!upstream.ok) {
      return response.status(401).json({ message: "Invalid login credentials" });
    }

    const payload = await upstream.json();
    return response.status(200).json({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    });
  } catch {
    return response.status(503).json({ message: "Authentication service unavailable" });
  }
}
