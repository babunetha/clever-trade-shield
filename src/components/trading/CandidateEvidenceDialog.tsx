import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { analyzeCandidateEvidence } from "@/lib/ai-analysis.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  symbol: string;
  name: string;
  metrics: Record<string, string | number | boolean | null>;
  verdict: string;
  plan: string;
}

interface Parsed {
  bullish: string | null;
  bearish: string | null;
  risks: string | null;
  verdict: string | null;
  raw: string;
}

function grabSection(text: string, heading: string) {
  const re = new RegExp(
    `##?\\s*${heading}[\\s\\S]*?(?=\\n##?\\s|\\nVerdict:\\s|$)`,
    "i",
  );
  const match = text.match(re);
  if (!match) return null;
  return match[0]
    .replace(/^##?.*$/m, "")
    .replace(/^Verdict:.*$/im, "")
    .trim();
}

function parseAnalysis(text: string): Parsed {
  const bullish = grabSection(text, "Bullish evidence");
  const bearish = grabSection(text, "Bearish evidence");
  const risks = grabSection(text, "Risk factors");
  const verdict = text.match(/Verdict:\s*([A-Z ]+)/)?.[1]?.trim() ?? null;
  return { bullish, bearish, risks, verdict, raw: text };
}

function Bullets({ text }: { text: string | null }) {
  if (!text) return null;
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      {lines.map((line, i) => (
        <li key={i}>· {line}</li>
      ))}
    </ul>
  );
}

/**
 * Lets the operator submit a candidate's indicators plus their own news
 * context and get an AI evidence summary (bullish / bearish / risk factors).
 * Analysis only — it cannot approve trades or override the risk engine.
 */
export function CandidateEvidenceDialog({ symbol, name, metrics, verdict, plan }: Props) {
  const [open, setOpen] = useState(false);
  const [news, setNews] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const analyze = useServerFn(analyzeCandidateEvidence);

  const submit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await analyze({
        data: { symbol, name, indicators: metrics, newsContext: news, verdict, plan },
      });
      if (!response.ok) {
        setError(response.error);
        toast.error(response.error);
      } else {
        setResult(parseAnalysis(response.analysis));
        toast.success(`AI evidence summary ready for ${symbol}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI analysis failed.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setResult(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Sparkles className="mr-1 size-3.5" /> AI evidence
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI evidence summary — {symbol}</DialogTitle>
          <DialogDescription>
            Submits this candidate's indicators and your own news context for analysis. The AI
            grounds every point in what you provide and never places or influences orders — the
            deterministic risk engine and your manual approval stay in charge.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <div className="label-caps mb-1">Indicators submitted (read-only)</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(metrics).map(([key, value]) => (
                <Badge key={key} variant="outline" className="num text-[11px]">
                  {key}: {String(value)}
                </Badge>
              ))}
              <Badge variant="outline" className="text-[11px]">
                verdict: {verdict}
              </Badge>
            </div>
          </div>
          <div>
            <div className="label-caps mb-1">Trade plan (read-only)</div>
            <p className="num text-xs text-muted-foreground">{plan}</p>
          </div>
          <div>
            <label className="label-caps mb-1 block" htmlFor={`news-${symbol}`}>
              News context (optional, your own notes or headlines)
            </label>
            <Textarea
              id={`news-${symbol}`}
              className="min-h-24 text-sm"
              maxLength={8000}
              placeholder="Paste headlines, results, announcements or your observations. Leave empty only if you truly have no context — the AI will flag news as missing."
              value={news}
              onChange={(e) => setNews(e.target.value)}
            />
          </div>

          {error ? (
            <div className="rounded-md border border-bear/40 bg-bear-muted p-3 text-xs text-bear">
              {error}
            </div>
          ) : null}

          {result ? (
            <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3">
              {result.verdict ? (
                <Badge variant="secondary" className="w-fit">
                  AI verdict: {result.verdict}
                </Badge>
              ) : null}
              <div>
                <div className="label-caps mb-1 text-success">Bullish evidence</div>
                <Bullets text={result.bullish} />
              </div>
              <div>
                <div className="label-caps mb-1 text-bear">Bearish evidence</div>
                <Bullets text={result.bearish} />
              </div>
              <div>
                <div className="label-caps mb-1 text-warn">Risk factors</div>
                <Bullets text={result.risks} />
              </div>
              {!result.bullish && !result.bearish && !result.risks ? (
                <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{result.raw}</pre>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={() => void submit()} disabled={loading}>
            {loading ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            {loading ? "Analysing…" : "Analyse evidence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
