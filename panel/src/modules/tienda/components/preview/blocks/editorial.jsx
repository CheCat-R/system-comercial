/** Familia Editorial — el blog. */
import MediaBox from "../MediaBox";
import { Placeholder, SectionHeading } from "./primitives";
import { formatDate } from "../../../lib/time";

export const PostList = ({ props, data }) => {
  const posts = data.posts || [];
  if (!posts.length) return <Placeholder>No hay notas publicadas con este filtro.</Placeholder>;

  return (
    <div className="st-block">
      <SectionHeading action={props.ctaHref ? <span className="st-btn st-btn--ghost">Ver todas</span> : null}>
        {props.heading}
      </SectionHeading>

      <div className="st-grid" style={{ "--st-cols": props.columns || 3 }}>
        {posts.map((p) => (
          <article className="st-postcard" key={p.id}>
            <MediaBox media={p.cover} ratio="16:9" alt={p.title} className="st-postcard__media" />
            <div className="st-postcard__body">
              {p.categoryNames.length > 0 && (
                <span className="st-postcard__cats">{p.categoryNames.join(" · ")}</span>
              )}
              <h4 className="st-postcard__title">{p.title}</h4>
              {props.showExcerpt && p.excerpt && <p className="st-postcard__excerpt">{p.excerpt}</p>}
              {props.showAuthor && (
                <span className="st-postcard__meta">
                  {p.authorName} · {formatDate(p.publishedAt)} · {p.readingMinutes} min
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

/**
 * Encabezado de la nota: portada, categorías, título, extracto y firma.
 * Los datos salen de la página misma (`page.post`), no de props.
 */
export const PostContent = ({ props, data }) => {
  const post = data.post;
  if (!post) return <Placeholder>Este bloque sólo funciona dentro de una nota del blog.</Placeholder>;

  return (
    <header className="st-postheader">
      {props.showCover && <MediaBox media={post.cover} ratio="16:9" alt={post.title} className="st-image" />}

      {post.categoryNames.length > 0 && (
        <span className="st-postcard__cats">{post.categoryNames.join(" · ")}</span>
      )}

      <h1 className="st-postheader__title">{post.title}</h1>
      {post.excerpt && <p className="st-postheader__excerpt">{post.excerpt}</p>}

      {props.showMeta && (
        <div className="st-postheader__meta">
          <span className="st-avatar" style={{ background: post.authorColor }} aria-hidden="true">
            {post.authorName?.[0] || "?"}
          </span>
          <span>
            <strong>{post.authorName}</strong>
            <em>
              {post.publishedAt ? formatDate(post.publishedAt) : "Sin publicar"} · {post.readingMinutes} min de lectura
            </em>
          </span>
        </div>
      )}
    </header>
  );
};

export const AuthorCard = ({ props, data }) => {
  const author = data.author;
  if (!author) return <Placeholder>Falta elegir un autor.</Placeholder>;

  return (
    <div className="st-authorcard">
      <span className="st-avatar st-avatar--lg" style={{ background: author.avatarColor }} aria-hidden="true">
        {author.name[0]}
      </span>
      <div>
        <strong>{author.name}</strong>
        <em>{author.role}</em>
        {props.showBio && author.bio && <p>{author.bio}</p>}
      </div>
    </div>
  );
};
