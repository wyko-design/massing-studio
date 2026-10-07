import proj4 from "proj4";

/** RD New (Amersfoort) definition, EPSG:28992. */
export const RD_NEW =
  "+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.4171,50.3319,465.5524,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs";

const converter = proj4("EPSG:4326", RD_NEW);

export const wgs84ToRd = (lon: number, lat: number): [number, number] =>
  converter.forward([lon, lat]) as [number, number];

export const rdToWgs84 = (x: number, y: number): [number, number] =>
  converter.inverse([x, y]) as [number, number];
