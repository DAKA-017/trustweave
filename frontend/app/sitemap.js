import { SITE_URL } from "@/lib/site";

const ROUTES = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/network", priority: 0.9, changeFrequency: "weekly" },
  { path: "/explainer", priority: 0.8, changeFrequency: "monthly" },
  { path: "/campaigns", priority: 0.7, changeFrequency: "monthly" },
  { path: "/records", priority: 0.7, changeFrequency: "monthly" },
  { path: "/simulator", priority: 0.7, changeFrequency: "monthly" },
  { path: "/newcomers", priority: 0.6, changeFrequency: "monthly" },
];

export default function sitemap() {
  const lastModified = new Date();
  return ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
