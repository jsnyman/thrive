const AUTH_TOKEN_KEY = "auth.token";

export type ApiClientOptions = {
  baseUrl?: string;
  fetchFn?: typeof fetch;
};

type RequestOptions = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
  withAuth?: boolean;
};

export const getAuthToken = (): string | null => {
  try {
    if (typeof globalThis.localStorage === "undefined") {
      return null;
    }
    const token = globalThis.localStorage.getItem(AUTH_TOKEN_KEY);
    if (token === null || token.trim().length === 0) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
};

export const setAuthToken = (token: string): void => {
  if (typeof globalThis.localStorage === "undefined") {
    return;
  }
  globalThis.localStorage.setItem(AUTH_TOKEN_KEY, token);
};

export const clearAuthToken = (): void => {
  if (typeof globalThis.localStorage === "undefined") {
    return;
  }
  globalThis.localStorage.removeItem(AUTH_TOKEN_KEY);
};

export const createApiClient = (options?: ApiClientOptions) => {
  const fetchFn = options?.fetchFn ?? fetch;
  const baseUrl = options?.baseUrl ?? "";

  const request = async (requestOptions: RequestOptions): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (requestOptions.withAuth ?? true) {
      const token = getAuthToken();
      if (token !== null) {
        headers["authorization"] = `Bearer ${token}`;
      }
    }
    if (requestOptions.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const requestInit: RequestInit = {
      method: requestOptions.method,
      headers,
    };
    if (requestOptions.body !== undefined) {
      requestInit.body = JSON.stringify(requestOptions.body);
    }

    const response = await fetchFn(`${baseUrl}${requestOptions.path}`, requestInit);
    return response;
  };

  const readJson = async <T>(response: Response, context: string): Promise<T> => {
    try {
      return (await response.json()) as T;
    } catch {
      throw new Error(`Invalid JSON from ${context}`);
    }
  };

  return {
    request,
    readJson,
  };
};
