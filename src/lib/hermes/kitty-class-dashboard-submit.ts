type DashboardSubmitterDependencies = {
  fetcher?: typeof fetch;
  createRequestId?: () => string;
};

export function createKittyClassDashboardSubmitter({
  fetcher = fetch,
  createRequestId = () => crypto.randomUUID(),
}: DashboardSubmitterDependencies = {}) {
  let pendingRequestId: string | null = null;

  return async (payload: unknown) => {
    pendingRequestId ??= createRequestId();
    const response = await fetcher("/api/admin/hermes/classes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": pendingRequestId,
      },
      body: JSON.stringify(payload),
    });
    if (response.ok) pendingRequestId = null;
    return response;
  };
}
