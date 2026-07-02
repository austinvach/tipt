import NewsArticlePage from "@/views/NewsArticle";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NewsArticlePage articleId={id} />;
}