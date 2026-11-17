// Exponential ElGamal on the Grumpkin curve embedded in the Noir field.
// A ballot is a one-hot vector. Each option adds Enc(0) or Enc(1). The public
// aggregate does not reveal which slot changed, because every slot is rerandomized.
// The point at infinity is (0, 0). It is not on the curve.

use std::embedded_curve_ops::{EmbeddedCurvePoint, EmbeddedCurveScalar, multi_scalar_mul};

pub global GENERATOR_X: Field = 1;
pub global GENERATOR_Y: Field = 17631683881184975370165255887551781615748388533673675138860;

pub fn generator() -> EmbeddedCurvePoint {
    EmbeddedCurvePoint { x: GENERATOR_X, y: GENERATOR_Y }
}

pub fn infinity() -> EmbeddedCurvePoint {
    EmbeddedCurvePoint { x: 0, y: 0 }
}

fn one_scalar() -> EmbeddedCurveScalar {
    EmbeddedCurveScalar::from_field(1)
}

fn scalar(value: Field) -> EmbeddedCurveScalar {
    EmbeddedCurveScalar::from_field(value)
}

pub fn mul(point: EmbeddedCurvePoint, value: Field) -> EmbeddedCurvePoint {
    multi_scalar_mul([point], [scalar(value)])
}

pub fn add(left: EmbeddedCurvePoint, right: EmbeddedCurvePoint) -> EmbeddedCurvePoint {
    multi_scalar_mul([left, right], [one_scalar(), one_scalar()])
}

pub fn negate(point: EmbeddedCurvePoint) -> EmbeddedCurvePoint {
    if point.is_infinite() {
        point
    } else {
        EmbeddedCurvePoint { x: point.x, y: -point.y }
    }
}

pub fn decode(x: Field, y: Field) -> EmbeddedCurvePoint {
    EmbeddedCurvePoint { x, y }
}

pub fn encode_x(point: EmbeddedCurvePoint) -> Field {
    if point.is_infinite() { 0 } else { point.x }
}

pub fn encode_y(point: EmbeddedCurvePoint) -> Field {
    if point.is_infinite() { 0 } else { point.y }
}

pub fn same_point(left: EmbeddedCurvePoint, right: EmbeddedCurvePoint) -> bool {
    if left.is_infinite() {
        right.is_infinite()
    } else if right.is_infinite() {
        false
    } else {
        (left.x == right.x) & (left.y == right.y)
    }
}

/// Enc(bit; randomness) under pk. randomness must be nonzero.
pub fn encrypt(bit: Field, randomness: Field, pk: EmbeddedCurvePoint) -> (EmbeddedCurvePoint, EmbeddedCurvePoint) {
    let c1 = mul(generator(), randomness);
    let c2 = add(mul(pk, randomness), mul(generator(), bit));
    (c1, c2)
}

pub fn decrypt_matches(c1: EmbeddedCurvePoint, c2: EmbeddedCurvePoint, sk: Field, count: Field) -> bool {
    let plain = add(c2, mul(negate(c1), sk));
    if count == 0 {
        plain.is_infinite()
    } else {
        same_point(plain, mul(generator(), count))
    }
}
