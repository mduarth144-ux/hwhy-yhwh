export async function fetchJson<T>(
  input: string,
  init?: RequestInit,
  options?: { retries?: number; retryDelayMs?: number },
): Promise<T> {
  const maxRetries = options?.retries ?? 1;
  const retryDelayMs = options?.retryDelayMs ?? 350;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(input, init);
      if (!res.ok) {
        let message = `Falha na requisição (${res.status})`;
        try {
          const errJson = (await res.json()) as { error?: string };
          if (errJson?.error) message = errJson.error;
        } catch {
          // ignore non-JSON body
        }
        throw new Error(message);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      const isNetworkTypeError = err instanceof TypeError;
      if (isAbort || !isNetworkTypeError || attempt >= maxRetries) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  if (lastError instanceof TypeError) {
    throw new Error('Falha de conexão com o servidor local. Tente novamente em instantes.');
  }
  throw lastError instanceof Error ? lastError : new Error('Erro inesperado na comunicação com o servidor.');
}
