import { config } from "hatchable";

export const access = "member";
export const methods = ["GET"];

const providers = [
  ["Dhan", "broker_market_data", ["DHAN_CLIENT_ID","DHAN_ACCESS_TOKEN"]],
  ["OpenAI", "ai", ["OPENAI_API_KEY"]],
  ["Google AI", "ai", ["GEMINI_API_KEY","GOOGLE_API_KEY"]],
  ["TradingAgents", "research_engine", ["TRADINGAGENTS_SERVICE_URL","TRADINGAGENTS_SERVICE_TOKEN"]],
  ["Exa", "research", ["EXA_API_KEY"]],
  ["Wolfram", "quant_validation", ["WOLFRAM_APP_ID"]],
  ["Bigdata.com", "financial_research", ["BIGDATA_API_KEY"]],
  ["The Fly", "financial_news", ["FLY_API_KEY"]],
  ["Newsify", "news", ["NEWSIFY_API_KEY"]],
  ["TradingCursor", "multi_signal", ["TRADINGCURSOR_API_KEY"]]
];

export default async function(req,res){
  const rows=[];
  for(const [name,role,keys] of providers){
    const configured={};
    for(const key of keys) configured[key]=Boolean(await config.get(key));
    rows.push({name,role,status:Object.values(configured).every(Boolean)?"CONFIGURED":"NOT_CONFIGURED",configured});
  }
  return res.json({
    ok:true,
    generatedAt:new Date().toISOString(),
    execution:"HARD_BLOCKED",
    providers:rows,
    repoSources:{
      cleverTradeShield:"runtime",
      aiTrader:"research_reference",
      tradingAgents:"research_engine",
      freqtrade:"strategy_backtest_reference"
    },
    note:"ChatGPT-connected plugins do not automatically become backend services. Backend providers require their own API credentials or a deployed service endpoint."
  });
}