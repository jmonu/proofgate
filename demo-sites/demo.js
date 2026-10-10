let claims;
async function boot() {
  claims = (await (await fetch("/config")).json()).claims;
  if (new URLSearchParams(location.search).has("denied")) {
    document.getElementById("status").textContent =
      "You declined the request. No attributes were shared.";
    return;
  }
  const result = await ProofGate.session();
  if (result) {
    document.getElementById("status").textContent =
      result.claim.type === "age_over"
        ? "Age requirement verified"
        : result.claim.type === "qualification"
          ? "B.Tech test credential verified"
          : result.claim.emailOwnership === "smtp-verified"
            ? "Verified email explicitly shared"
            : "Demo email explicitly shared — ownership unverified";
    document.getElementById("result").textContent = JSON.stringify(
      result,
      null,
      2,
    );
    document.getElementById("receipt").hidden = false;
  }
}
document.getElementById("continue").addEventListener("click", async () => {
  const button = document.getElementById("continue");
  button.disabled = true;
  try {
    await ProofGate.authorize({ claims });
  } catch (e) {
    document.getElementById("status").textContent = e.message;
    button.disabled = false;
  }
});
document.getElementById("logout").addEventListener("click", async () => {
  await fetch("/logout", { method: "POST" });
  location.href = "/";
});
boot().catch(
  () =>
    (document.getElementById("status").textContent =
      "Unable to reach the website server. Try again."),
);
