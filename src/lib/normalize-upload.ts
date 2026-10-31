import { UPLOAD_LIMITS } from "./models";

/** Browser decoding applies orientation/colour profiles and preserves alpha in the PNG. */
export async function normalizeUpload(file: File | Blob, filename: string): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error(`Não foi possível ler “${filename}”. Exporte novamente como PNG ou JPG.`));
      image.src = url;
    });
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 24_000_000
    )
      throw new Error(
        `A imagem “${filename}” excede o limite de 24 megapixels. Reduza a resolução.`,
      );
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem neste navegador.");
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("Falha ao converter a imagem para PNG.")),
        "image/png",
      );
    });
    if (blob.size > UPLOAD_LIMITS.maxBytes)
      throw new Error(
        `A imagem “${filename}” excede 10 MB após a conversão para PNG. Reduza a resolução.`,
      );
    return new File([blob], `${filename.replace(/\.[^.]*$/, "") || "imagem"}.png`, {
      type: "image/png",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
