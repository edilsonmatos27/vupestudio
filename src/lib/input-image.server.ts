import { PhotonImage } from "@cf-wasm/photon";
import { imageSize } from "image-size";
import { UPLOAD_LIMITS } from "./models";

const MAX_PIXELS = 24_000_000;

export class InputImageError extends Error {}

/** Decode every pixel and re-encode as an ordinary RGBA PNG, including legacy uploads. */
export function normalizeInputImage(bytes: Uint8Array, filename: string) {
  const name = Array.from(filename || "imagem")
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
    .slice(0, 100);
  const invalid = () =>
    new InputImageError(
      `Não foi possível ler a imagem “${name}”. Exporte novamente como PNG ou JPG e envie outra vez.`,
    );
  if (!bytes.length || bytes.length > UPLOAD_LIMITS.maxBytes) throw invalid();
  let image: PhotonImage | undefined;
  try {
    const { width, height, type } = imageSize(bytes);
    if (!["png", "jpg", "webp"].includes(type ?? "")) throw invalid();
    if (!width || !height || width * height > MAX_PIXELS)
      throw new InputImageError(
        `A imagem “${name}” excede o limite de 24 megapixels. Reduza a resolução e envie novamente.`,
      );
    image = PhotonImage.new_from_byteslice(bytes);
    const png = image.get_bytes();
    if (png.length > UPLOAD_LIMITS.maxBytes)
      throw new InputImageError(
        `A imagem “${name}” excede 10 MB após a conversão para PNG. Reduza a resolução e envie novamente.`,
      );
    return {
      bytes: png,
      mime: "image/png",
      name: `${
        name
          .replace(/\.[^.]*$/, "")
          .replace(/[^\w.\- ]+/g, "_")
          .slice(0, 96) || "imagem"
      }.png`,
    };
  } catch (e) {
    if (e instanceof InputImageError) throw e;
    throw invalid();
  } finally {
    image?.free();
  }
}
