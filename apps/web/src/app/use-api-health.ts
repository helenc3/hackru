import { useEffect, useState } from 'react';

type Health = { buildId: string; providers: { geminiConfigured: boolean; elevenlabsConfigured: boolean }; features: { fixtures: boolean; validationHarness: boolean } };

export function useApiHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthProblem, setHealthProblem] = useState('');
  const [healthRefresh, setHealthRefresh] = useState(0);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    void fetch('/api/health', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('The API is unavailable.');
      const body = await response.json() as Partial<Health>;
      if (!body.features || typeof body.features.fixtures !== 'boolean' || typeof body.features.validationHarness !== 'boolean' || !body.providers || typeof body.providers.geminiConfigured !== 'boolean' || typeof body.providers.elevenlabsConfigured !== 'boolean') throw new Error('The API health response is invalid.');
      setHealth(body as Health); setHealthProblem('');
    }).catch(() => { if (disposed) return; if (!controller.signal.aborted) setHealthProblem('The API could not be reached.'); else setHealthProblem('The API check timed out.'); }).finally(() => clearTimeout(timeout));
    return () => { disposed = true; controller.abort(); clearTimeout(timeout); };
  }, [healthRefresh]);

  return { health, healthProblem, retryHealth: () => setHealthRefresh((count) => count + 1) };
}
