import { drawnLines, lineX, lineY, type Grid } from "./grid";

/**
 * The drawn grid lines (all but the outermost ones, see EDGE_CELLS), each running to the page
 * edges. Each line is a zero-width box with a 1 px border, so it is snapped to device pixels
 * exactly like the borders of the boxes placed on it.
 */
export function GridLines({ grid, overlay = false }: { grid: Grid; overlay?: boolean }) {
  const border = "1px solid var(--grid-line)";
  const lines = drawnLines(grid);
  const cols = lines.cols.map((i) => lineX(grid, i));
  const rows = lines.rows.map((k) => lineY(grid, k));
  return (
    <div
      aria-hidden
      data-grid={overlay ? "overlay" : "background"}
      style={{ position: "absolute", inset: 0, zIndex: overlay ? 100 : 0, pointerEvents: "none" }}
    >
      {cols.map((x) => (
        <div key={`c${x}`} className="grid-line" data-x={x} style={{ left: x, top: 0, height: grid.height, borderLeft: border }} />
      ))}
      {rows.map((y) => (
        <div key={`r${y}`} className="grid-line" data-y={y} style={{ top: y, left: 0, width: grid.width, borderTop: border }} />
      ))}
    </div>
  );
}
