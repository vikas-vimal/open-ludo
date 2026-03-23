export type TrackCoordinate = {
  cell: number;
  row: number;
  col: number;
};

export const LUDO_BOARD_SIZE = 15;

// Main 52-cell route laid out on a classic 15x15 ludo board cross.
export const MAIN_TRACK_COORDINATES: TrackCoordinate[] = [
  { cell: 0, row: 7, col: 2 },
  { cell: 1, row: 7, col: 3 },
  { cell: 2, row: 7, col: 4 },
  { cell: 3, row: 7, col: 5 },
  { cell: 4, row: 7, col: 6 },
  { cell: 5, row: 6, col: 7 },
  { cell: 6, row: 5, col: 7 },
  { cell: 7, row: 4, col: 7 },
  { cell: 8, row: 3, col: 7 },
  { cell: 9, row: 2, col: 7 },
  { cell: 10, row: 1, col: 7 },
  { cell: 11, row: 1, col: 8 },
  { cell: 12, row: 1, col: 9 },
  { cell: 13, row: 2, col: 9 },
  { cell: 14, row: 3, col: 9 },
  { cell: 15, row: 4, col: 9 },
  { cell: 16, row: 5, col: 9 },
  { cell: 17, row: 6, col: 9 },
  { cell: 18, row: 7, col: 10 },
  { cell: 19, row: 7, col: 11 },
  { cell: 20, row: 7, col: 12 },
  { cell: 21, row: 7, col: 13 },
  { cell: 22, row: 7, col: 14 },
  { cell: 23, row: 7, col: 15 },
  { cell: 24, row: 8, col: 15 },
  { cell: 25, row: 9, col: 15 },
  { cell: 26, row: 9, col: 14 },
  { cell: 27, row: 9, col: 13 },
  { cell: 28, row: 9, col: 12 },
  { cell: 29, row: 9, col: 11 },
  { cell: 30, row: 9, col: 10 },
  { cell: 31, row: 10, col: 9 },
  { cell: 32, row: 11, col: 9 },
  { cell: 33, row: 12, col: 9 },
  { cell: 34, row: 13, col: 9 },
  { cell: 35, row: 14, col: 9 },
  { cell: 36, row: 15, col: 9 },
  { cell: 37, row: 15, col: 8 },
  { cell: 38, row: 15, col: 7 },
  { cell: 39, row: 14, col: 7 },
  { cell: 40, row: 13, col: 7 },
  { cell: 41, row: 12, col: 7 },
  { cell: 42, row: 11, col: 7 },
  { cell: 43, row: 10, col: 7 },
  { cell: 44, row: 9, col: 6 },
  { cell: 45, row: 9, col: 5 },
  { cell: 46, row: 9, col: 4 },
  { cell: 47, row: 9, col: 3 },
  { cell: 48, row: 9, col: 2 },
  { cell: 49, row: 9, col: 1 },
  { cell: 50, row: 8, col: 1 },
  { cell: 51, row: 7, col: 1 },
];

const TRACK_BY_CELL = new Map<number, TrackCoordinate>(
  MAIN_TRACK_COORDINATES.map((coordinate) => [coordinate.cell, coordinate]),
);

export function getMainTrackCoordinate(cell: number): TrackCoordinate {
  const coordinate = TRACK_BY_CELL.get(cell);
  if (!coordinate) {
    throw new Error(`Invalid ludo track cell: ${cell}`);
  }
  return coordinate;
}
