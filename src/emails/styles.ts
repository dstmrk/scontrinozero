export const emailStyles = {
  body: {
    backgroundColor: "#f9fafb",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  container: {
    backgroundColor: "#ffffff",
    margin: "40px auto",
    borderRadius: "8px",
    maxWidth: "560px",
    overflow: "hidden" as const,
  },
  header: {
    backgroundColor: "#009689",
    borderRadius: "8px 8px 0 0",
    padding: "24px 32px",
  },
  headerTitle: {
    fontSize: "22px",
    fontWeight: "700" as const,
    color: "#ffffff",
    margin: "0",
    letterSpacing: "-0.3px",
  },
  headerSubtitle: {
    fontSize: "13px",
    color: "#ccfbf1",
    margin: "4px 0 0",
  },
  content: {
    padding: "32px",
  },
  subheading: {
    fontSize: "20px",
    fontWeight: "600" as const,
    color: "#111827",
    margin: "0 0 12px",
  },
  hr: {
    borderColor: "#e5e7eb",
    margin: "0",
  },
  text: {
    fontSize: "15px",
    lineHeight: "24px",
    color: "#374151",
    margin: "12px 0",
  },
  button: {
    backgroundColor: "#009689",
    borderRadius: "6px",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: "600" as const,
    padding: "12px 24px",
    textDecoration: "none",
    display: "inline-block",
    margin: "20px 0 8px",
  },
  footer: {
    fontSize: "12px",
    color: "#9ca3af",
    textAlign: "center" as const,
    margin: "0",
    padding: "16px 32px",
  },
};
