/** Familia Presentación — portadas, imágenes y texto. */
import { useState, useEffect } from "react";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";

import MediaBox from "../MediaBox";
import { Placeholder, SectionHeading, Paragraphs } from "./primitives";

export const Hero = ({ props, data }) => {
  const banners = data.banners || [];
  const [index, setIndex] = useState(0);
  const count = banners.length;
  const autoplay = Number(props.autoplayMs) || 0;

  useEffect(() => {
    if (count < 2 || autoplay <= 0) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), autoplay);
    return () => clearInterval(timer);
  }, [count, autoplay]);

  if (!count) return <Placeholder>Este hero no tiene banners cargados.</Placeholder>;

  const banner = banners[Math.min(index, count - 1)];

  return (
    <div className={`st-hero st-hero--${props.height || "lg"} st-hero--${banner.theme || "light"}`}>
      <MediaBox media={banner.media} alt={banner.headline} className="st-hero__media">
        <span className="st-hero__scrim" style={{ opacity: (Number(props.overlay) || 0) / 100 }} />
        <div className={`st-hero__content st-hero__content--${banner.position || "center"}`}>
          {banner.headline && <h2 className="st-hero__headline">{banner.headline}</h2>}
          {banner.subheadline && <p className="st-hero__sub">{banner.subheadline}</p>}
          {banner.cta?.label && <span className="st-btn st-btn--primary">{banner.cta.label}</span>}
        </div>
      </MediaBox>

      {props.showDots && count > 1 && (
        <div className="st-hero__dots">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              className={`st-hero__dot ${i === index ? "is-active" : ""}`.trim()}
              onClick={(e) => { e.stopPropagation(); setIndex(i); }}
              aria-label={`Banner ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const RichText = ({ props }) => {
  if (!props.heading && !props.body) return <Placeholder>Bloque de texto vacío.</Placeholder>;
  return (
    <div className={`st-prose st-prose--${props.align || "left"} ${props.maxWidth === "prose" ? "st-prose--narrow" : ""}`.trim()}>
      {props.heading && <h3 className="st-prose__heading">{props.heading}</h3>}
      <Paragraphs text={props.body} />
    </div>
  );
};

export const ImageBlock = ({ props, data }) => {
  if (!data.media) return <Placeholder>Falta elegir una imagen.</Placeholder>;
  return <MediaBox media={data.media} ratio={props.ratio || "auto"} alt={props.alt} className="st-image" />;
};

export const ImageText = ({ props, data }) => (
  <div className={`st-split ${props.imageSide === "right" ? "st-split--reverse" : ""}`.trim()}>
    <div className="st-split__media">
      <MediaBox media={data.media} ratio="4:3" alt={props.heading} />
    </div>
    <div className="st-split__text">
      {props.heading && <h3 className="st-prose__heading">{props.heading}</h3>}
      <Paragraphs text={props.body} />
      {props.ctaLabel && <span className="st-btn st-btn--outline">{props.ctaLabel}</span>}
    </div>
  </div>
);

export const Video = ({ props, data }) => {
  if (!props.url) return <Placeholder>Falta la URL del video.</Placeholder>;
  return (
    <figure className="st-video">
      <MediaBox media={data.poster} ratio={props.ratio || "16:9"} alt={props.caption || "Video"}>
        <span className="st-video__scrim" />
        <span className="st-video__play"><PlayArrowRoundedIcon /></span>
      </MediaBox>
      {props.caption && <figcaption className="st-video__caption">{props.caption}</figcaption>}
    </figure>
  );
};

export const Gallery = ({ props, data }) => {
  const items = data.media || [];
  if (!items.length) return <Placeholder>Agregá al menos dos imágenes.</Placeholder>;

  const ratio = { square: "1:1", wide: "4:3", tall: "3:4" }[props.aspect] || "1:1";

  return (
    <div className="st-block">
      <SectionHeading>{props.heading}</SectionHeading>
      <div className="st-grid" style={{ "--st-cols": props.columns || 3 }}>
        {items.map((m) => (
          <MediaBox key={m.id} media={m} ratio={ratio} alt={m.alt} className="st-image" />
        ))}
      </div>
    </div>
  );
};
