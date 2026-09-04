import sharp from 'sharp';
const A = process.argv[2], OUT = 'public/textures/sols';
const jobs = [
  ['Asphalt012/Asphalt012_1K-JPG_Color.jpg', 'enrobe_couleur.jpg', 1024, 82],
  ['Asphalt012/Asphalt012_1K-JPG_NormalGL.jpg', 'enrobe_normales.jpg', 1024, 88],
  ['Asphalt012/Asphalt012_1K-JPG_Roughness.jpg', 'enrobe_rugosite.jpg', 512, 80],
  ['Grass004/Grass004_1K-JPG_Color.jpg', 'herbe_couleur.jpg', 1024, 82],
  ['Grass004/Grass004_1K-JPG_NormalGL.jpg', 'herbe_normales.jpg', 1024, 88],
  ['Grass004/Grass004_1K-JPG_AmbientOcclusion.jpg', 'herbe_occlusion.jpg', 512, 80],
  ['Concrete034/Concrete034_1K-JPG_Color.jpg', 'beton_couleur.jpg', 1024, 82],
  ['Concrete034/Concrete034_1K-JPG_NormalGL.jpg', 'beton_normales.jpg', 1024, 88],
  ['PavingStones067/PavingStones067_1K-JPG_Color.jpg', 'paves_couleur.jpg', 1024, 82],
  ['PavingStones067/PavingStones067_1K-JPG_NormalGL.jpg', 'paves_normales.jpg', 1024, 88],
  ['Ground037/Ground037_1K-JPG_Color.jpg', 'stabilise_couleur.jpg', 1024, 82],
  ['Ground037/Ground037_1K-JPG_NormalGL.jpg', 'stabilise_normales.jpg', 1024, 88],
  ['Bark012/Bark012_1K-JPG_Color.jpg', 'ecorce_couleur.jpg', 1024, 82],
  ['Bark012/Bark012_1K-JPG_NormalGL.jpg', 'ecorce_normales.jpg', 1024, 88],
];
for (const [src, dst, size, q] of jobs) {
  const img = sharp(`${A}/${src}`).resize(size, size);
  const st = await sharp(`${A}/${src}`).stats();
  await img.jpeg({ quality: q, chromaSubsampling: '4:4:4' }).toFile(`${OUT}/${dst}`);
  console.log(dst, 'moyenne RGB', st.channels.map(c => Math.round(c.mean)).join(','));
}
