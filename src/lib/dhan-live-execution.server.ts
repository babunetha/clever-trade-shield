const DHAN_BASE = "https://api.dhan.co/v2";
const ORDER_TIMEOUT_MS = 10_000;

export type LiveExecutionCode = "DISABLED"|"NOT_CONFIGURED"|"UNAUTHORIZED"|"RATE_LIMITED"|"TIMEOUT"|"NETWORK"|"UPSTREAM"|"BAD_REQUEST";
export interface LiveExecutionGate { enabled: boolean; reasons: string[]; }
export interface LiveOrderRequest {
  dhanClientId: string; correlationId: string; transactionType: "BUY"|"SELL";
  exchangeSegment: "NSE_EQ"|"BSE_EQ"; productType: "INTRADAY"; orderType: "MARKET"|"LIMIT";
  securityId: string; quantity: number; price?: number; validity: "DAY"|"IOC";
}
export interface LiveOrderResult {
  placed: boolean; state: "SUBMITTED"|"UNKNOWN"|"REJECTED"; orderId?: string; orderStatus?: string;
  correlationId: string; code?: LiveExecutionCode; reason?: string;
}
function credentials() {
  const clientId=process.env["DHAN_CLIENT_ID"]??"", accessToken=process.env["DHAN_ACCESS_TOKEN"]??"";
  return clientId&&accessToken?{clientId,accessToken}:null;
}
export function liveExecutionGate(): LiveExecutionGate {
  const reasons:string[]=[];
  if(process.env["CTS_LIVE_EXECUTION_ENABLED"]!=="true") reasons.push("CTS_LIVE_EXECUTION_ENABLED is not true.");
  if(process.env["CTS_LIVE_EXECUTION_CONFIRMATION"]!=="ENABLE_LIVE_TRADING") reasons.push("Live execution confirmation phrase is missing.");
  if(process.env["RISK_TRADING_ENABLED"]!=="true") reasons.push("RISK_TRADING_ENABLED is not true.");
  if(!process.env["DHAN_POSTBACK_SECRET"]) reasons.push("DHAN_POSTBACK_SECRET is not configured.");
  if(!process.env["DHAN_STATIC_IP"]) reasons.push("DHAN_STATIC_IP is not configured for the production egress IP.");
  if(!credentials()) reasons.push("Dhan server credentials are not configured.");
  return {enabled:reasons.length===0,reasons};
}
function validCorrelationId(v:string){return /^[A-Za-z0-9 _-]{1,30}$/.test(v);}
function validOrder(o:LiveOrderRequest){
  if(!validCorrelationId(o.correlationId)) return "Invalid correlation ID.";
  if(!/^\d{1,8}$/.test(o.securityId)) return "Invalid Dhan security ID.";
  if(!Number.isInteger(o.quantity)||o.quantity<=0) return "Invalid quantity.";
  if(o.orderType==="LIMIT"&&(!Number.isFinite(o.price)||Number(o.price)<=0)) return "LIMIT orders require a positive price.";
  if(o.orderType==="MARKET"&&o.price!==undefined) return "MARKET orders must not include a price.";
  return null;
}
function scrub(message:string){
  const c=credentials(); let out=message;
  if(c){out=out.split(c.accessToken).join("[redacted]");out=out.split(c.clientId).join("[redacted]");}
  return out.replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,"[redacted]").slice(0,300);
}
async function dhanOrderRequest<T>(path:string,init:RequestInit):Promise<{ok:true;data:T}|{ok:false;code:LiveExecutionCode;error:string}>{
  const c=credentials(); if(!c)return{ok:false,code:"NOT_CONFIGURED",error:"Dhan credentials are not configured on the server."};
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),ORDER_TIMEOUT_MS);
  try{
    const response=await fetch(DHAN_BASE+path,{...init,headers:{Accept:"application/json","Content-Type":"application/json","access-token":c.accessToken,"client-id":c.clientId,...(init.headers??{})},signal:controller.signal});
    const text=await response.text();
    if(!response.ok){
      if(response.status===401||response.status===403)return{ok:false,code:"UNAUTHORIZED",error:"Dhan rejected authentication."};
      if(response.status===429)return{ok:false,code:"RATE_LIMITED",error:"Dhan order rate limit reached."};
      return{ok:false,code:"UPSTREAM",error:scrub(`Dhan returned HTTP ${response.status}: ${text||"no response body"}`)};
    }
    try{return{ok:true,data:JSON.parse(text) as T};}catch{return{ok:false,code:"BAD_REQUEST",error:"Dhan returned invalid JSON."};}
  }catch(error){
    if(error instanceof Error&&error.name==="AbortError")return{ok:false,code:"TIMEOUT",error:"Dhan order request timed out. State is UNKNOWN; reconcile by correlation ID before any retry."};
    return{ok:false,code:"NETWORK",error:scrub(error instanceof Error?error.message:"Unknown network error")};
  }finally{clearTimeout(timer);}
}
export async function placeLiveDhanOrder(order:LiveOrderRequest):Promise<LiveOrderResult>{
  const gate=liveExecutionGate();
  if(!gate.enabled)return{placed:false,state:"REJECTED",correlationId:order.correlationId,code:"DISABLED",reason:gate.reasons.join(" ")};
  const validation=validOrder(order); if(validation)return{placed:false,state:"REJECTED",correlationId:order.correlationId,code:"BAD_REQUEST",reason:validation};
  const body={dhanClientId:order.dhanClientId,correlationId:order.correlationId,transactionType:order.transactionType,exchangeSegment:order.exchangeSegment,productType:order.productType,orderType:order.orderType,validity:order.validity,securityId:order.securityId,quantity:order.quantity,disclosedQuantity:"",price:order.price??"",triggerPrice:"",afterMarketOrder:false};
  const result=await dhanOrderRequest<{orderId?:string;orderStatus?:string}>("/orders",{method:"POST",body:JSON.stringify(body)});
  if(!result.ok)return{placed:false,state:result.code==="TIMEOUT"||result.code==="NETWORK"?"UNKNOWN":"REJECTED",correlationId:order.correlationId,code:result.code,reason:result.error};
  const orderId=String(result.data.orderId??""),orderStatus=String(result.data.orderStatus??"");
  if(!orderId)return{placed:false,state:"UNKNOWN",correlationId:order.correlationId,code:"BAD_REQUEST",reason:"Dhan did not return an order ID. Reconcile by correlation ID."};
  return{placed:orderStatus!=="REJECTED",state:orderStatus==="REJECTED"?"REJECTED":"SUBMITTED",orderId,orderStatus,correlationId:order.correlationId};
}
export async function getLiveDhanOrderByCorrelationId(correlationId:string){
  if(!validCorrelationId(correlationId))throw new Error("Invalid correlation ID.");
  const result=await dhanOrderRequest<Record<string,unknown>>("/orders/external/"+encodeURIComponent(correlationId),{method:"GET"});
  if(!result.ok)return result;
  return{ok:true as const,data:{orderId:String(result.data["orderId"]??""),correlationId:String(result.data["correlationId"]??correlationId),orderStatus:String(result.data["orderStatus"]??""),quantity:Number(result.data["quantity"]??0),filledQty:Number(result.data["filledQty"]??0),averageTradedPrice:Number(result.data["averageTradedPrice"]??0),tradingSymbol:String(result.data["tradingSymbol"]??""),securityId:String(result.data["securityId"]??""),raw:result.data}};
}
export async function cancelLiveDhanOrder(orderId:string){
  if(!/^\d{5,30}$/.test(orderId))return{ok:false as const,error:"Invalid Dhan order ID."};
  return dhanOrderRequest<Record<string,unknown>>("/orders/"+encodeURIComponent(orderId),{method:"DELETE"});
}
