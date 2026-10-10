import { useState } from "react";
export function DobField({ initial }: { initial: string }) {
  const [dob, setDob] = useState(initial);
  const now = new Date(),
    date = new Date(dob + "T00:00:00Z");
  const valid =
    dob >= "1900-01-01" &&
    dob <= now.toISOString().slice(0, 10) &&
    !isNaN(+date) &&
    date.toISOString().slice(0, 10) === dob;
  const age = valid
    ? now.getUTCFullYear() -
      date.getUTCFullYear() -
      (now.getUTCMonth() < date.getUTCMonth() ||
      (now.getUTCMonth() === date.getUTCMonth() &&
        now.getUTCDate() < date.getUTCDate())
        ? 1
        : 0)
    : null;
  return (
    <>
      <label>
        Date of birth
        <input
          name="dob"
          type="date"
          required
          min="1900-01-01"
          max={now.toISOString().slice(0, 10)}
          value={dob}
          onChange={(e) => setDob(e.target.value)}
        />
      </label>
      <div className="calculated-age">
        <span>Calculated age</span>
        <strong>
          {age ?? "—"}
          <small>{age !== null ? " years" : ""}</small>
        </strong>
        <small>Updates automatically from your date of birth.</small>
      </div>
    </>
  );
}
