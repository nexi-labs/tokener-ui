import {
  siSap, siSiemens, siVisa, siMastercard, siFedex, siDhl, siUps, siShopify, siSquare, siKlarna, siWoocommerce, siMagento,
  siWalmart, siTarget, siAmazon, siTesla, siBosch, siSchneiderelectric, siGeneralelectric, siNvidia, siIntel, siCisco, siEricsson,
  siNokia, siVodafone, siVerizon, siTmobile, siOrange, siShell, siCoursera, siMoodle, siCanvas, siGoogleclassroom, siKhanacademy,
  siZoom, siRockwellautomation, siCaterpillar, siJohndeere, siAutodesk, siDassaultsystemes, siAnsys, siUnity, siMqtt, siTableau,
  siLooker, siAirbus, siBoeing, siLufthansa, siEmirates, siQatarairways, siTomtom, siHere, siMapbox, siGooglemaps, siOpenstreetmap,
  siWise, siCoinbase, siAdp, siQuickbooks, siXero, siSage, siMailchimp, siMixpanel, siLinkedin, siIndeed, siGreenhouse, siElsevier,
  siPubmed, siApacheairflow, siApachespark, siNeo4j, siElasticsearch, siWhatsapp, siTelegram, siIntercom, siDropbox, siBox,
  siGoogledrive, siAnsible, siAirtel, siHuawei, siSamsung, siOpsgenie, siUber, siDoordash, siEbay, siEtsy, siPytorch, siTensorflow,
  siOnnx, siAwslambda, siJupyter, siPandas, siEuropeanunion, siQuickbooks as siQb,
} from "simple-icons";
import {
  Landmark, Building2, Banknote, CreditCard, ShieldCheck, ShieldAlert, FileText, FileSearch, Scale, Gavel, Stethoscope,
  HeartPulse, Pill, Syringe, Microscope, Activity, Truck, Package, Boxes, Warehouse, Route, MapPin, Plane, Ship, Factory, Cog,
  Wrench, Gauge, Thermometer, Zap, Sun, Wind, Plug, BatteryCharging, RadioTower, Wifi, Signal, Smartphone, Phone, Headphones,
  MessageSquare, Mail, GraduationCap, BookOpen, Library, Users, UserCheck, ShoppingCart, ShoppingBag, Store, Tag, Receipt, Percent,
  Database, Search, ScanSearch, ScanText, Layers, Bot, Brain, Sparkles, Network, Server, Cloud, Lock, KeyRound, EyeOff,
  Fingerprint, Wallet, Bell, Siren, ListChecks, ClipboardCheck, Camera, Image as ImageIcon, Video, FileSpreadsheet, Calendar, Clock,
  TrendingUp, BarChart3, LineChart, Globe, Leaf, Cpu, HardDrive, Workflow, GitBranch, Hammer, Eye, Radar, Car, Home, HardHat,
  Flame, Droplets, Satellite, Briefcase, FileCheck, Archive, Inbox, Undo2, Rocket, AppWindow, TerminalSquare, Blocks, Terminal,
  PackageCheck, FolderOpen, UserRound, Languages, Handshake, FileSignature, ReceiptText, ArrowLeftRight, Fuel, Cable, Waypoints,
  ScrollText, Hospital, Baby, Ambulance, Shirt, Utensils, Ticket, Megaphone, Repeat, ScanLine, Lightbulb, MonitorSmartphone, Bike,
  type LucideIcon,
} from "lucide-react";
import type { IconRef } from "@/components/studio/types";
import { brand } from "@/lib/industries";
import { FN_ICONS, type FnIconName } from "@/lib/functions/icon-set";

type SI = { title: string; path: string; hex: string };
const si = (i: SI): IconRef => ({ si: i });

/** Brands beyond the connector catalogue. Lookups by display name. */
const EXTRA_BRANDS: Record<string, IconRef> = {
  "AWS Lambda": si(siAwslambda), SAP: si(siSap), Siemens: si(siSiemens), Visa: si(siVisa), Mastercard: si(siMastercard), FedEx: si(siFedex), DHL: si(siDhl),
  UPS: si(siUps), Shopify: si(siShopify), Square: si(siSquare), Klarna: si(siKlarna), WooCommerce: si(siWoocommerce), Magento: si(siMagento),
  Walmart: si(siWalmart), Target: si(siTarget), Amazon: si(siAmazon), Tesla: si(siTesla), Bosch: si(siBosch),
  "Schneider Electric": si(siSchneiderelectric), "General Electric": si(siGeneralelectric), NVIDIA: si(siNvidia), Intel: si(siIntel),
  Cisco: si(siCisco), Ericsson: si(siEricsson), Nokia: si(siNokia), Vodafone: si(siVodafone), Verizon: si(siVerizon),
  "T-Mobile": si(siTmobile), Orange: si(siOrange), Shell: si(siShell), Coursera: si(siCoursera), Moodle: si(siMoodle), Canvas: si(siCanvas),
  "Google Classroom": si(siGoogleclassroom), "Khan Academy": si(siKhanacademy), Zoom: si(siZoom), "Rockwell Automation": si(siRockwellautomation),
  Caterpillar: si(siCaterpillar), "John Deere": si(siJohndeere), Autodesk: si(siAutodesk), "Dassault Systemes": si(siDassaultsystemes),
  Ansys: si(siAnsys), Unity: si(siUnity), MQTT: si(siMqtt), Tableau: si(siTableau), Looker: si(siLooker), Airbus: si(siAirbus),
  Boeing: si(siBoeing), Lufthansa: si(siLufthansa), Emirates: si(siEmirates), "Qatar Airways": si(siQatarairways), TomTom: si(siTomtom),
  HERE: si(siHere), Mapbox: si(siMapbox), "Google Maps": si(siGooglemaps), OpenStreetMap: si(siOpenstreetmap), Wise: si(siWise),
  Coinbase: si(siCoinbase), ADP: si(siAdp), QuickBooks: si(siQb), Xero: si(siXero), Sage: si(siSage), Mailchimp: si(siMailchimp),
  Mixpanel: si(siMixpanel), LinkedIn: si(siLinkedin), Indeed: si(siIndeed), Greenhouse: si(siGreenhouse), Elsevier: si(siElsevier),
  PubMed: si(siPubmed), "Apache Airflow": si(siApacheairflow), "Apache Spark": si(siApachespark), Neo4j: si(siNeo4j),
  Elasticsearch: si(siElasticsearch), WhatsApp: si(siWhatsapp), Telegram: si(siTelegram), Intercom: si(siIntercom), Dropbox: si(siDropbox),
  Box: si(siBox), "Google Drive": si(siGoogledrive), Ansible: si(siAnsible), "Airtel": si(siAirtel), Huawei: si(siHuawei), Samsung: si(siSamsung),
  Opsgenie: si(siOpsgenie), Uber: si(siUber), DoorDash: si(siDoordash), eBay: si(siEbay), Etsy: si(siEtsy), PyTorch: si(siPytorch),
  TensorFlow: si(siTensorflow), "ONNX": si(siOnnx), Jupyter: si(siJupyter), pandas: si(siPandas), "European Union": si(siEuropeanunion),
};

/** Industry systems that are categories rather than a single product. They get a neutral glyph, never a borrowed logo. */
const GENERIC: Record<string, LucideIcon> = {
  "Core banking": Landmark, "Payments hub": ArrowLeftRight, "SWIFT messaging": Globe, "Card processor": CreditCard, "Loan origination": FileSignature,
  "KYC platform": UserCheck, "AML monitoring": ShieldAlert, "Claims system": ClipboardCheck, "Policy admin": ScrollText, "Broker portal": Handshake,
  "EHR": Hospital, "FHIR server": Stethoscope, "PACS imaging": ScanLine, "Lab system": Microscope, "Pharmacy system": Pill, "Patient portal": UserRound,
  "Order management": ReceiptText, "Product catalogue": Tag, "Point of sale": Store, "Loyalty platform": Ticket, "Inventory": Boxes,
  "ERP": Building2, "MES": Factory, "SCADA historian": Gauge, "PLC network": Cable, "CMMS": Wrench, "Quality system": ClipboardCheck, "Digital twin": Layers,
  "Transport management": Truck, "Warehouse management": Warehouse, "Telematics": Satellite, "Carrier APIs": Waypoints, "Customs filings": FileCheck, "Route planner": Route,
  "Grid SCADA": Zap, "Asset registry": Database, "Smart meters": Gauge, "Outage management": Siren, "Trading desk": TrendingUp, "Field service": HardHat,
  "OSS and BSS": Network, "Network inventory": Server, "Billing": Receipt, "Contact centre": Headphones, "Trouble tickets": Inbox, "Radio network": RadioTower,
  "Learning platform": GraduationCap, "Student records": Library, "Library catalogue": BookOpen, "Admissions": Users, "Assessment bank": ListChecks,
  "Document management": FolderOpen, "Case management": Briefcase, "Matter database": Scale, "Contract repository": FileSignature, "e-Discovery": FileSearch,
  "Citizen portal": Home, "Records office": Archive, "Permit system": FileCheck, "Procurement": Handshake,
  "Intranet": Globe, "HR system": Users, "Data warehouse": Database, "Wiki": BookOpen, "Ticketing": Inbox, "Billing system": Receipt, "Feature store": Layers,
  "Mobile app": Smartphone, "Web app": AppWindow, "Internal tools": Blocks, "Data lake": HardDrive, "Email archive": Mail, "Chat platform": MessageSquare,
};

/** Icons referenced by name in scene specs and content. */
export const LUCIDE: Record<string, LucideIcon> = {
  Landmark, Building2, Banknote, CreditCard, ShieldCheck, ShieldAlert, FileText, FileSearch, Scale, Gavel, Stethoscope, HeartPulse, Pill, Syringe,
  Microscope, Activity, Truck, Package, Boxes, Warehouse, Route, MapPin, Plane, Ship, Factory, Cog, Wrench, Gauge, Thermometer, Zap, Sun, Wind, Plug,
  BatteryCharging, RadioTower, Wifi, Signal, Smartphone, Phone, Headphones, MessageSquare, Mail, GraduationCap, BookOpen, Library, Users, UserCheck,
  ShoppingCart, ShoppingBag, Store, Tag, Receipt, Percent, Database, Search, ScanSearch, ScanText, Layers, Bot, Brain, Sparkles, Network, Server, Cloud,
  Lock, KeyRound, EyeOff, Fingerprint, Wallet, Bell, Siren, ListChecks, ClipboardCheck, Camera, Image: ImageIcon, Video, FileSpreadsheet, Calendar, Clock,
  TrendingUp, BarChart3, LineChart, Globe, Leaf, Cpu, HardDrive, Workflow, GitBranch, Hammer, Eye, Radar, Car, Home, HardHat, Flame, Droplets, Satellite,
  Briefcase, FileCheck, Archive, Inbox, Undo2, Rocket, AppWindow, TerminalSquare, Blocks, Terminal, PackageCheck, FolderOpen, UserRound, Languages,
  Handshake, FileSignature, ReceiptText, ArrowLeftRight, Fuel, Cable, Waypoints, ScrollText, Hospital, Baby, Ambulance, Shirt, Utensils, Ticket,
  Megaphone, Repeat, ScanLine, Lightbulb, MonitorSmartphone, Bike,
};

/** Resolve a brand name from the connector catalogue first, then the extra list, then a neutral glyph for generic systems. */
export function brandOf(name: string): { name: string; icon: IconRef } {
  const extra = EXTRA_BRANDS[name];
  if (extra) return { name, icon: extra };
  const g = GENERIC[name];
  if (g) return { name, icon: { lucide: g } };
  return brand(name);
}

export const brands = (...names: string[]) => names.map(brandOf);

/**
 * Icon reference used by serialisable scene specs:
 *   "l:Truck"        a lucide glyph
 *   "b:Stripe"       a brand, generic system or connector by display name
 *   "f:function"     a glyph from the tok∑ner Functions icon set
 */
export function iconFor(ref: string): IconRef {
  const [kind, ...rest] = ref.split(":");
  const key = rest.join(":");
  if (kind === "l") {
    const L = LUCIDE[key];
    if (!L) throw new Error(`Unknown icon "${ref}"`);
    return { lucide: L };
  }
  if (kind === "b") return brandOf(key).icon;
  if (kind === "f") {
    if (!(key in FN_ICONS)) throw new Error(`Unknown function icon "${ref}"`);
    return { fn: key as FnIconName };
  }
  throw new Error(`Bad icon reference "${ref}"`);
}

/** Every known system name, for build-time checks. */
export const KNOWN_SYSTEMS = (): string[] => [...Object.keys(EXTRA_BRANDS), ...Object.keys(GENERIC)];
