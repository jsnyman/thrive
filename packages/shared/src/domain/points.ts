const POINT_TENTHS_MULTIPLIER = 10;
const FLOAT_EPSILON = 1e-9;

export const toPointTenths = (value: number): number =>
  Math.round((value + FLOAT_EPSILON) * POINT_TENTHS_MULTIPLIER);

export const tenthsToPoints = (value: number): number => value / POINT_TENTHS_MULTIPLIER;

export const normalizePointValue = (value: number): number => tenthsToPoints(toPointTenths(value));

export const isTenthsPointValue = (value: number): boolean =>
  Number.isFinite(value) &&
  Math.abs(value * POINT_TENTHS_MULTIPLIER - Math.round(value * POINT_TENTHS_MULTIPLIER)) <
    FLOAT_EPSILON;

export const floorPointsToTenths = (value: number): number =>
  tenthsToPoints(Math.floor((value + FLOAT_EPSILON) * POINT_TENTHS_MULTIPLIER));

export const sumPointValues = (values: number[]): number =>
  tenthsToPoints(values.reduce((sum, value) => sum + toPointTenths(value), 0));

export const multiplyPointValue = (value: number, multiplier: number): number =>
  tenthsToPoints(toPointTenths(value) * multiplier);

export const comparePointValues = (left: number, right: number): number =>
  toPointTenths(left) - toPointTenths(right);

export const formatPointValue = (value: number): string => normalizePointValue(value).toFixed(1);
