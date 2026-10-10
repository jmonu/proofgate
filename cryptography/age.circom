pragma circom 2.1.6;
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// DOB is issuer-validated YYYYMMDD. Feb 29 reaches anniversary on Mar 1
// in non-leap years. Salt prevents guessing DOB from the commitment.
template AgeCredential() {
    signal input dob;
    signal input salt;
    signal input commitment;
    signal input minimumAge;
    signal input asOf;
    signal input requestHash;
    signal output requestBinding;
    component dobRange = Num2Bits(27); dobRange.in <== dob;
    component dateRange = Num2Bits(27); dateRange.in <== asOf;
    component ageRange = Num2Bits(7); ageRange.in <== minimumAge;
    component issued = Poseidon(2);
    issued.inputs[0] <== dob;
    issued.inputs[1] <== salt;
    issued.out === commitment;
    component eligible = LessEqThan(28);
    eligible.in[0] <== dob + minimumAge * 10000;
    eligible.in[1] <== asOf;
    eligible.out === 1;
    component binding = Poseidon(2);
    binding.inputs[0] <== salt;
    binding.inputs[1] <== requestHash;
    requestBinding <== binding.out;
}
component main { public [commitment, minimumAge, asOf, requestHash] } = AgeCredential();
