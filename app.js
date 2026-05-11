const STORAGE_KEY = "sku-profit-calculator-history";
const EXCHANGE_RATE_STORAGE_KEY = "sku-profit-calculator-exchange-rates";
const EXCHANGE_RATE_SYNC_META_KEY = "sku-profit-calculator-exchange-sync-meta";
const EXCHANGE_RATE_API_URL = "https://open.er-api.com/v6/latest/CNY";
const RELEASE_VERSION = "v1.0.1";
const RELEASE_UPDATED_AT = "2026-05-11";
const CURRENCY_OPTIONS = [
  { value: "USD", label: "美元", symbol: "$" },
  { value: "MYR", label: "马来币", symbol: "RM" },
  { value: "RMB", label: "人民币", symbol: "¥" }
];
const DEFAULT_EXCHANGE_RATES = {
  USD: 7.2,
  MYR: 1.53,
  RMB: 1
};
const DOMESTIC_FREIGHT_RATE_MYR_PER_10G = 0.15;
const MARKETING_BASE_LAST_MILE_MYR = 4.9;

const scenarios = [
  {
    id: "domestic-organic",
    name: "国内发货 - 自然流",
    summary: "适合广告投入较低或不投流的常规款，以平台抽佣、支付手续费、国内发货物流和基础损耗为核心。",
    formulaSummary: [
      "销售收入(RMB) = 销售价(外币) × 汇率 × 签收率",
      "营销费 = ((产品售价 × 销售汇率) + (4.9马币 × 马来币汇率)) × 签收率 × 营销费率",
      "平台费 = 销售收入 × 平台佣金率",
      "支付手续费 = 销售收入 × 支付手续费率",
      "国内物流 = 向上取整((产品重量 + 包装重量) ÷ 10克) × 0.15马币 × 马来币汇率",
      "利润 = 销售收入 - 产品成本 - 包装成本 - 国内物流 - 平台费 - 支付手续费 - 营销费 - 售后备付"
    ],
    groups: [
      {
        title: "销售参数",
        fields: [
          { key: "saleCurrency", label: "销售币种", defaultValue: "USD", type: "select", options: CURRENCY_OPTIONS },
          { key: "sellingPrice", label: "单品售价", unit: "USD", defaultValue: 29.9, step: "0.01", dynamicUnit: "saleCurrency" },
          { key: "exchangeRate", label: "汇率", unit: "RMB/USD", defaultValue: 7.2, step: "0.0001", dynamicUnit: "exchangeRate" },
          { key: "signRate", label: "签收率", unit: "%", defaultValue: 92, step: "0.1", ratio: true },
          { key: "marketingRate", label: "营销费率", unit: "%", defaultValue: 4.86, step: "0.01", ratio: true },
          { key: "platformCommissionRate", label: "平台佣金率", unit: "%", defaultValue: 8, step: "0.1", ratio: true },
          { key: "paymentFeeRate", label: "支付手续费率", unit: "%", defaultValue: 3, step: "0.1", ratio: true },
          { key: "afterSalesRate", label: "售后/退款备付率", unit: "%", defaultValue: 2, step: "0.1", ratio: true }
        ]
      },
      {
        title: "成本参数",
        fields: [
          { key: "productCost", label: "产品采购成本", unit: "RMB", defaultValue: 48, step: "0.01" },
          { key: "packagingCost", label: "包装材料成本", unit: "RMB", defaultValue: 3, step: "0.01" },
          { key: "productWeightGram", label: "产品重量", unit: "g", defaultValue: 300, step: "1" },
          { key: "packagingWeightGram", label: "包装重量", unit: "g", defaultValue: 50, step: "1", help: "国内发货按 (产品重量 + 包装重量) 每 10 克 0.15 马币自动换算为人民币物流成本。" },
          { key: "handlingCost", label: "人工/操作成本", unit: "RMB", defaultValue: 2.5, step: "0.01" }
        ]
      }
    ],
    compute(values) {
      const revenue = values.sellingPrice * values.exchangeRate * values.signRate;
      const marketingFee = calculateMarketingFee(values);
      const platformFee = revenue * values.platformCommissionRate;
      const paymentFee = revenue * values.paymentFeeRate;
      const reserve = revenue * values.afterSalesRate;
      const logisticsCost = calculateDomesticShippingCost(values.productWeightGram, values.packagingWeightGram);
      const totalCost =
        values.productCost +
        values.packagingCost +
        logisticsCost +
        values.handlingCost +
        marketingFee +
        platformFee +
        paymentFee +
        reserve;

      return {
        revenue,
        totalCost,
        profit: revenue - totalCost,
        adCost: 0,
        marketingFee,
        platformFee,
        paymentFee,
        reserve,
        logisticsCost,
        productBlockCost: values.productCost + values.packagingCost + values.handlingCost
      };
    }
  },
  {
    id: "domestic-viral",
    name: "国内发货 - 爆款推流",
    summary: "适合重广告投流款，额外把广告消耗、达人佣金、活动折扣补贴纳入单笔订单核算，重点看利润率与投流 ROI。",
    formulaSummary: [
      "销售收入(RMB) = 销售价(外币) × 汇率 × 签收率",
      "营销费 = ((产品售价 × 销售汇率) + (4.9马币 × 马来币汇率)) × 签收率 × 营销费率",
      "达人佣金 = 销售收入 × 达人佣金率",
      "广告成本 = 单量分摊广告费 + 达人佣金 + 活动补贴",
      "国内物流 = 向上取整((产品重量 + 包装重量) ÷ 10克) × 0.15马币 × 马来币汇率",
      "利润 = 销售收入 - 产品/包装/物流/平台/支付/营销/广告/售后等全部成本",
      "ROI = 利润 ÷ 广告成本"
    ],
    groups: [
      {
        title: "销售参数",
        fields: [
          { key: "saleCurrency", label: "销售币种", defaultValue: "USD", type: "select", options: CURRENCY_OPTIONS },
          { key: "sellingPrice", label: "单品售价", unit: "USD", defaultValue: 35.9, step: "0.01", dynamicUnit: "saleCurrency" },
          { key: "exchangeRate", label: "汇率", unit: "RMB/USD", defaultValue: 7.2, step: "0.0001", dynamicUnit: "exchangeRate" },
          { key: "signRate", label: "签收率", unit: "%", defaultValue: 88, step: "0.1", ratio: true },
          { key: "marketingRate", label: "营销费率", unit: "%", defaultValue: 4.86, step: "0.01", ratio: true },
          { key: "platformCommissionRate", label: "平台佣金率", unit: "%", defaultValue: 8, step: "0.1", ratio: true },
          { key: "paymentFeeRate", label: "支付手续费率", unit: "%", defaultValue: 3.2, step: "0.1", ratio: true },
          { key: "afterSalesRate", label: "售后/退款备付率", unit: "%", defaultValue: 3, step: "0.1", ratio: true }
        ]
      },
      {
        title: "成本参数",
        fields: [
          { key: "productCost", label: "产品采购成本", unit: "RMB", defaultValue: 52, step: "0.01" },
          { key: "packagingCost", label: "包装材料成本", unit: "RMB", defaultValue: 3.5, step: "0.01" },
          { key: "productWeightGram", label: "产品重量", unit: "g", defaultValue: 380, step: "1" },
          { key: "packagingWeightGram", label: "包装重量", unit: "g", defaultValue: 60, step: "1", help: "国内发货按 (产品重量 + 包装重量) 每 10 克 0.15 马币自动换算为人民币物流成本。" },
          { key: "handlingCost", label: "人工/操作成本", unit: "RMB", defaultValue: 3, step: "0.01" }
        ]
      },
      {
        title: "推流参数",
        fields: [
          { key: "adCostPerOrder", label: "单笔广告消耗", unit: "RMB", defaultValue: 26, step: "0.01" },
          { key: "influencerCommissionRate", label: "达人佣金率", unit: "%", defaultValue: 10, step: "0.1", ratio: true },
          { key: "promotionSubsidy", label: "活动补贴/优惠券", unit: "RMB", defaultValue: 5, step: "0.01" }
        ]
      }
    ],
    compute(values) {
      const revenue = values.sellingPrice * values.exchangeRate * values.signRate;
      const marketingFee = calculateMarketingFee(values);
      const platformFee = revenue * values.platformCommissionRate;
      const paymentFee = revenue * values.paymentFeeRate;
      const reserve = revenue * values.afterSalesRate;
      const influencerCommission = revenue * values.influencerCommissionRate;
      const adCost = values.adCostPerOrder + influencerCommission + values.promotionSubsidy;
      const logisticsCost = calculateDomesticShippingCost(values.productWeightGram, values.packagingWeightGram);
      const totalCost =
        values.productCost +
        values.packagingCost +
        logisticsCost +
        values.handlingCost +
        marketingFee +
        platformFee +
        paymentFee +
        reserve +
        adCost;

      return {
        revenue,
        totalCost,
        profit: revenue - totalCost,
        adCost,
        marketingFee,
        influencerCommission,
        platformFee,
        paymentFee,
        reserve,
        logisticsCost,
        productBlockCost: values.productCost + values.packagingCost + values.handlingCost
      };
    }
  },
  {
    id: "overseas-viral",
    name: "国外发货 - 爆款推流",
    summary: "适合海外仓或本地履约爆款，除了投流成本，还需考虑头程分摊、海外仓操作费、尾程派送和仓储损耗。",
    formulaSummary: [
      "销售收入(RMB) = 销售价(外币) × 汇率 × 签收率",
      "营销费 = ((产品售价 × 销售汇率) + (4.9马币 × 马来币汇率)) × 签收率 × 营销费率",
      "达人佣金 = 销售收入 × 达人佣金率",
      "物流履约 = 头程分摊 + 海外仓操作费 + 尾程派送 + 仓储损耗",
      "广告成本 = 广告消耗 + 达人佣金 + 活动补贴",
      "利润 = 销售收入 - 全部履约成本 - 平台成本 - 营销费 - 广告成本 - 售后备付"
    ],
    groups: [
      {
        title: "销售参数",
        fields: [
          { key: "saleCurrency", label: "销售币种", defaultValue: "USD", type: "select", options: CURRENCY_OPTIONS },
          { key: "sellingPrice", label: "单品售价", unit: "USD", defaultValue: 42.9, step: "0.01", dynamicUnit: "saleCurrency" },
          { key: "exchangeRate", label: "汇率", unit: "RMB/USD", defaultValue: 7.2, step: "0.0001", dynamicUnit: "exchangeRate" },
          { key: "signRate", label: "签收率", unit: "%", defaultValue: 90, step: "0.1", ratio: true },
          { key: "marketingRate", label: "营销费率", unit: "%", defaultValue: 4.86, step: "0.01", ratio: true },
          { key: "platformCommissionRate", label: "平台佣金率", unit: "%", defaultValue: 8, step: "0.1", ratio: true },
          { key: "paymentFeeRate", label: "支付手续费率", unit: "%", defaultValue: 3.5, step: "0.1", ratio: true },
          { key: "afterSalesRate", label: "售后/退款备付率", unit: "%", defaultValue: 2.5, step: "0.1", ratio: true }
        ]
      },
      {
        title: "商品与履约成本",
        fields: [
          { key: "productCost", label: "产品采购成本", unit: "RMB", defaultValue: 58, step: "0.01" },
          { key: "headFreightCost", label: "头程分摊成本", unit: "RMB", defaultValue: 12, step: "0.01" },
          { key: "warehouseHandlingCost", label: "海外仓操作费", unit: "RMB", defaultValue: 6, step: "0.01" },
          { key: "lastMileCost", label: "海外尾程派送费", unit: "RMB", defaultValue: 28, step: "0.01" },
          { key: "storageCost", label: "仓储/滞销损耗", unit: "RMB", defaultValue: 4.5, step: "0.01" },
          { key: "packagingCost", label: "包装材料成本", unit: "RMB", defaultValue: 3.5, step: "0.01" }
        ]
      },
      {
        title: "推流参数",
        fields: [
          { key: "adCostPerOrder", label: "单笔广告消耗", unit: "RMB", defaultValue: 32, step: "0.01" },
          { key: "influencerCommissionRate", label: "达人佣金率", unit: "%", defaultValue: 10, step: "0.1", ratio: true },
          { key: "promotionSubsidy", label: "活动补贴/优惠券", unit: "RMB", defaultValue: 6, step: "0.01" }
        ]
      }
    ],
    compute(values) {
      const revenue = values.sellingPrice * values.exchangeRate * values.signRate;
      const marketingFee = calculateMarketingFee(values);
      const platformFee = revenue * values.platformCommissionRate;
      const paymentFee = revenue * values.paymentFeeRate;
      const reserve = revenue * values.afterSalesRate;
      const influencerCommission = revenue * values.influencerCommissionRate;
      const adCost = values.adCostPerOrder + influencerCommission + values.promotionSubsidy;
      const logisticsCost =
        values.headFreightCost +
        values.warehouseHandlingCost +
        values.lastMileCost +
        values.storageCost;
      const productBlockCost = values.productCost + values.packagingCost;
      const totalCost =
        productBlockCost +
        logisticsCost +
        marketingFee +
        platformFee +
        paymentFee +
        reserve +
        adCost;

      return {
        revenue,
        totalCost,
        profit: revenue - totalCost,
        adCost,
        marketingFee,
        influencerCommission,
        platformFee,
        paymentFee,
        reserve,
        logisticsCost,
        productBlockCost
      };
    }
  }
];

let activeScenarioId = scenarios[0].id;
let history = loadHistory();
let exchangeRates = loadExchangeRates();
let exchangeSyncMeta = loadExchangeSyncMeta();

const scenarioTabs = document.getElementById("scenarioTabs");
const scenarioIntro = document.getElementById("scenarioIntro");
const calculatorForm = document.getElementById("calculatorForm");
const metricGrid = document.getElementById("metricGrid");
const costBreakdown = document.getElementById("costBreakdown");
const insightList = document.getElementById("insightList");
const formulaSummary = document.getElementById("formulaSummary");
const historyList = document.getElementById("historyList");
const exchangeRatePanel = document.getElementById("exchangeRatePanel");
const releaseInfo = document.getElementById("releaseInfo");
const exchangeSyncStatus = document.getElementById("exchangeSyncStatus");

document.getElementById("resetButton").addEventListener("click", () => {
  renderForm(getScenario());
  renderResults();
});

document.getElementById("resetRatesButton").addEventListener("click", () => {
  exchangeRates = { ...DEFAULT_EXCHANGE_RATES };
  exchangeSyncMeta = {
    ...exchangeSyncMeta,
    lastSyncAt: "",
    lastSyncDate: ""
  };
  persistExchangeRates();
  persistExchangeSyncMeta();
  renderExchangeRatePanel();
  renderExchangeSyncStatus("已重置为默认汇率");
  syncExchangeRateWithCurrency(true);
  renderResults();
});

document.getElementById("saveSnapshotButton").addEventListener("click", () => {
  const scenario = getScenario();
  const values = readValues(scenario);
  const result = scenario.compute(values);
  const snapshot = {
    id: `${scenario.id}-${Date.now()}`,
    scenarioName: scenario.name,
    timestamp: new Date().toLocaleString("zh-CN"),
    profit: result.profit,
    margin: result.revenue ? result.profit / result.revenue : 0,
    revenue: result.revenue
  };

  history = [snapshot, ...history].slice(0, 10);
  persistHistory();
  renderHistory();
});

document.getElementById("clearHistoryButton").addEventListener("click", () => {
  history = [];
  persistHistory();
  renderHistory();
});

renderTabs();
renderExchangeRatePanel();
renderForm(getScenario());
renderResults();
renderHistory();
renderReleaseInfo();
renderExchangeSyncStatus("准备同步中...");
scheduleMidnightExchangeSync();
syncExchangeRatesIfNeeded();

function getScenario() {
  return scenarios.find((item) => item.id === activeScenarioId);
}

function renderTabs() {
  scenarioTabs.innerHTML = "";

  scenarios.forEach((scenario) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `scenario-tab${scenario.id === activeScenarioId ? " active" : ""}`;
    button.innerHTML = `<strong>${scenario.name}</strong><small>${scenario.summary}</small>`;
    button.addEventListener("click", () => {
      activeScenarioId = scenario.id;
      renderTabs();
      renderForm(scenario);
      renderResults();
    });
    scenarioTabs.appendChild(button);
  });
}

function renderForm(scenario) {
  scenarioIntro.textContent = scenario.summary;
  calculatorForm.innerHTML = "";

  scenario.groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "field-group";

    const title = document.createElement("h3");
    title.textContent = group.title;
    section.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "field-grid";

    group.fields.forEach((field) => {
      const wrapper = document.createElement("div");
      wrapper.className = `field${field.help ? " full-width" : ""}`;

      const label = document.createElement("label");
      label.setAttribute("for", field.key);
      label.textContent = buildFieldLabel(field, scenario);

      let input;
      if (field.type === "select") {
        input = document.createElement("select");
        field.options.forEach((option) => {
          const optionElement = document.createElement("option");
          optionElement.value = option.value;
          optionElement.textContent = option.label;
          if (option.value === field.defaultValue) {
            optionElement.selected = true;
          }
          input.appendChild(optionElement);
        });
        input.addEventListener("change", () => {
          syncExchangeRateWithCurrency(true);
          updateDynamicLabels(scenario);
          renderResults();
        });
      } else {
        input = document.createElement("input");
        input.type = "number";
        input.step = field.step || "0.01";
        input.value = field.defaultValue;
        input.addEventListener("input", renderResults);
      }

      input.id = field.key;
      input.name = field.key;

      wrapper.append(label, input);

      if (field.help) {
        const helper = document.createElement("div");
        helper.className = "helper";
        helper.textContent = field.help;
        wrapper.appendChild(helper);
      }

      grid.appendChild(wrapper);
    });

    section.appendChild(grid);
    calculatorForm.appendChild(section);
  });

  syncExchangeRateWithCurrency(true);
  updateDynamicLabels(scenario);
}

function readValues(scenario) {
  const values = {};

  scenario.groups.forEach((group) => {
    group.fields.forEach((field) => {
      const input = document.getElementById(field.key);
      if (field.type === "select") {
        values[field.key] = input.value;
        return;
      }

      const rawValue = Number(input.value || 0);
      values[field.key] = field.ratio ? rawValue / 100 : rawValue;
    });
  });

  return values;
}

function renderResults() {
  const scenario = getScenario();
  const values = readValues(scenario);
  const result = scenario.compute(values);
  const saleCurrency = getCurrencyMeta(values.saleCurrency);

  const profitMargin = result.revenue ? result.profit / result.revenue : 0;
  const costRate = result.revenue ? result.totalCost / result.revenue : 0;
  const roi = result.adCost ? result.profit / result.adCost : null;
  const breakevenPrice = values.signRate * values.exchangeRate
    ? result.totalCost / (values.signRate * values.exchangeRate)
    : 0;

  metricGrid.innerHTML = [
    createMetricCard("销售收入", formatCurrency(result.revenue), "按签收率折算后的单笔收入"),
    createMetricCard("总成本", formatCurrency(result.totalCost), "包含产品、平台、物流、广告与备付"),
    createMetricCard("单品利润", formatCurrency(result.profit), profitMargin >= 0 ? "当前测算利润为正" : "当前测算利润为负", true, result.profit >= 0),
    createMetricCard("利润率", formatPercent(profitMargin), "利润 ÷ 销售收入", false, profitMargin >= 0),
    createMetricCard("成本率", formatPercent(costRate), "总成本 ÷ 销售收入"),
    createMetricCard("投流 ROI", roi === null ? "不适用" : formatNumber(roi), result.adCost ? "利润 ÷ 广告成本" : "当前模板不含推流广告")
  ].join("");

  costBreakdown.innerHTML = [
    createBreakdownRow("产品与基础处理", result.productBlockCost),
    createBreakdownRow("物流履约成本", result.logisticsCost),
    createBreakdownRow("营销费用", result.marketingFee || 0),
    createBreakdownRow("平台佣金", result.platformFee),
    createBreakdownRow("支付手续费", result.paymentFee),
    createBreakdownRow("售后备付", result.reserve),
    createBreakdownRow("广告与推广", result.adCost)
  ].join("");

  const insights = buildInsights({ result, profitMargin, roi, breakevenPrice, values, saleCurrency });
  insightList.innerHTML = insights.map((item) => `<div class="insight-item"><span>${item.label}</span><strong class="${item.good ? "positive" : "negative"}">${item.value}</strong></div>`).join("");

  formulaSummary.innerHTML = scenario.formulaSummary.map((line) => `<div>${line}</div>`).join("");
}

function buildInsights({ result, profitMargin, roi, breakevenPrice, values, saleCurrency }) {
  const signPriceLoss = values.sellingPrice - breakevenPrice;
  return [
    {
      label: profitMargin >= 0.15 ? "利润安全垫" : "利润安全垫",
      value: profitMargin >= 0.15 ? "利润率高于 15%，相对健康" : "利润率低于 15%，建议继续压成本或提客单",
      good: profitMargin >= 0.15
    },
    {
      label: "保本售价",
      value: `${formatCurrency(breakevenPrice, saleCurrency.value)} / 单`,
      good: values.sellingPrice >= breakevenPrice
    },
    {
      label: "售价空间",
      value: signPriceLoss >= 0
        ? `当前售价高于保本价 ${formatCurrency(signPriceLoss, saleCurrency.value)}`
        : `当前售价低于保本价 ${formatCurrency(Math.abs(signPriceLoss), saleCurrency.value)}`,
      good: signPriceLoss >= 0
    },
    {
      label: "投流判断",
      value: roi === null ? "自然流模型，无投流 ROI" : roi > 0.3 ? "ROI 大于 0.3，投流仍有利润空间" : "ROI 偏低，需优化广告或转化",
      good: roi === null || roi > 0.3
    }
  ];
}

function renderHistory() {
  if (!history.length) {
    historyList.className = "history-list empty-state";
    historyList.textContent = "暂无历史记录，点击“保存本次测算”后会保存在浏览器本地。";
    return;
  }

  historyList.className = "history-list";
  historyList.innerHTML = history
    .map(
      (item) => `
        <div class="history-item">
          <div>
            <strong>${item.scenarioName}</strong>
            <div class="history-meta">${item.timestamp}</div>
          </div>
          <div>
            <strong class="${item.profit >= 0 ? "positive" : "negative"}">${formatCurrency(item.profit)}</strong>
            <div class="history-meta">利润率 ${formatPercent(item.margin)}</div>
          </div>
        </div>
      `
    )
    .join("");
}

function loadHistory() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function loadExchangeRates() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(EXCHANGE_RATE_STORAGE_KEY) || "{}");
    return { ...DEFAULT_EXCHANGE_RATES, ...saved };
  } catch (error) {
    return { ...DEFAULT_EXCHANGE_RATES };
  }
}

function loadExchangeSyncMeta() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(EXCHANGE_RATE_SYNC_META_KEY) || "{}");
    return {
      lastSyncAt: saved.lastSyncAt || "",
      lastSyncDate: saved.lastSyncDate || "",
      lastSyncSource: saved.lastSyncSource || ""
    };
  } catch (error) {
    return { lastSyncAt: "", lastSyncDate: "", lastSyncSource: "" };
  }
}

function persistHistory() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function persistExchangeRates() {
  window.localStorage.setItem(EXCHANGE_RATE_STORAGE_KEY, JSON.stringify(exchangeRates));
}

function persistExchangeSyncMeta() {
  window.localStorage.setItem(EXCHANGE_RATE_SYNC_META_KEY, JSON.stringify(exchangeSyncMeta));
}

function createMetricCard(label, value, note, highlight = false, good = true) {
  return `
    <div class="metric-card${highlight ? " highlight" : ""}">
      <p class="metric-label">${label}</p>
      <div class="metric-value ${good ? "positive" : "negative"}">${value}</div>
      <div class="metric-note">${note}</div>
    </div>
  `;
}

function createBreakdownRow(name, value) {
  return `
    <div class="breakdown-row">
      <span class="cost-name">${name}</span>
      <strong>${formatCurrency(value)}</strong>
    </div>
  `;
}

function formatCurrency(value, currency = "RMB") {
  if (!Number.isFinite(value)) return "--";
  const currencyMeta = getCurrencyMeta(currency);
  return `${currencyMeta.symbol}${value.toFixed(2)}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "--";
  return value.toFixed(2);
}

function calculateMarketingFee(values) {
  const priceBaseRmb = values.sellingPrice * values.exchangeRate;
  const tailShippingBaseRmb = MARKETING_BASE_LAST_MILE_MYR * getExchangeRate("MYR");
  const marketingBaseRmb = (priceBaseRmb + tailShippingBaseRmb) * values.signRate;
  return marketingBaseRmb * values.marketingRate;
}

function calculateDomesticShippingCost(productWeightGram, packagingWeightGram) {
  const totalWeightGram = Math.max(productWeightGram, 0) + Math.max(packagingWeightGram, 0);
  const chargeableUnits = Math.ceil(totalWeightGram / 10);
  const shippingMyr = chargeableUnits * DOMESTIC_FREIGHT_RATE_MYR_PER_10G;
  return shippingMyr * getExchangeRate("MYR");
}

function renderExchangeRatePanel() {
  exchangeRatePanel.innerHTML = CURRENCY_OPTIONS.map((currency) => {
    const rate = exchangeRates[currency.value];
    return `
      <div class="exchange-card">
        <strong>${currency.label}</strong>
        <span>1 ${currency.value} = ? RMB</span>
        <input
          id="rate-${currency.value}"
          type="number"
          step="0.0001"
          min="0"
          value="${rate}"
        />
      </div>
    `;
  }).join("");

  CURRENCY_OPTIONS.forEach((currency) => {
    const input = document.getElementById(`rate-${currency.value}`);
    input.addEventListener("input", () => {
      const nextValue = Number(input.value || 0);
      exchangeRates[currency.value] = nextValue;
      persistExchangeRates();
      syncExchangeRateWithCurrency(true);
      renderResults();
    });
  });
}

function getCurrencyMeta(currencyValue) {
  return CURRENCY_OPTIONS.find((item) => item.value === currencyValue) || CURRENCY_OPTIONS[0];
}

function buildFieldLabel(field, scenario) {
  const currentCurrencyValue = getCurrentCurrencyValue(scenario);
  const currentCurrency = getCurrencyMeta(currentCurrencyValue);

  if (field.dynamicUnit === "saleCurrency") {
    return `${field.label} (${currentCurrency.value})`;
  }

  if (field.dynamicUnit === "exchangeRate") {
    return `${field.label} (RMB/${currentCurrency.value})`;
  }

  return field.unit ? `${field.label} (${field.unit})` : field.label;
}

function getCurrentCurrencyValue(scenario) {
  const currentSelect = document.getElementById("saleCurrency");
  if (currentSelect) {
    return currentSelect.value;
  }

  const saleCurrencyField = scenario.groups
    .flatMap((group) => group.fields)
    .find((field) => field.key === "saleCurrency");

  return saleCurrencyField ? saleCurrencyField.defaultValue : "USD";
}

function updateDynamicLabels(scenario) {
  scenario.groups.forEach((group) => {
    group.fields.forEach((field) => {
      const label = calculatorForm.querySelector(`label[for="${field.key}"]`);
      if (label) {
        label.textContent = buildFieldLabel(field, scenario);
      }
    });
  });
}

function syncExchangeRateWithCurrency() {
  const saleCurrencyInput = document.getElementById("saleCurrency");
  const exchangeRateInput = document.getElementById("exchangeRate");
  if (!saleCurrencyInput || !exchangeRateInput) return;

  exchangeRateInput.value = getExchangeRate(saleCurrencyInput.value);
}

function getExchangeRate(currencyValue) {
  return exchangeRates[currencyValue] ?? DEFAULT_EXCHANGE_RATES[currencyValue] ?? 1;
}

function renderReleaseInfo() {
  if (!releaseInfo) return;
  releaseInfo.textContent = `版本 ${RELEASE_VERSION} · 更新于 ${RELEASE_UPDATED_AT}`;
}

function renderExchangeSyncStatus(prefix) {
  if (!exchangeSyncStatus) return;
  const suffix = exchangeSyncMeta.lastSyncAt
    ? `最近同步：${exchangeSyncMeta.lastSyncAt}`
    : "最近同步：暂无";
  exchangeSyncStatus.textContent = `汇率同步状态：${prefix} · ${suffix}`;
}

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function scheduleMidnightExchangeSync() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  const delay = nextMidnight.getTime() - now.getTime();

  window.setTimeout(() => {
    syncExchangeRates(true);
    scheduleMidnightExchangeSync();
  }, delay);
}

async function syncExchangeRatesIfNeeded() {
  const today = getTodayDateKey();
  if (exchangeSyncMeta.lastSyncDate === today) {
    renderExchangeSyncStatus("今日已自动更新");
    return;
  }
  await syncExchangeRates(false);
}

async function syncExchangeRates(force) {
  const today = getTodayDateKey();
  if (!force && exchangeSyncMeta.lastSyncDate === today) {
    renderExchangeSyncStatus("今日已自动更新");
    return;
  }

  renderExchangeSyncStatus("同步中");
  try {
    const response = await fetch(EXCHANGE_RATE_API_URL, { method: "GET" });
    const payload = await response.json();
    if (!response.ok || !payload || !payload.rates || !payload.rates.USD || !payload.rates.MYR) {
      throw new Error("Invalid exchange rate payload");
    }

    // API provides 1 CNY = X currency; system needs RMB per target currency.
    exchangeRates = {
      ...exchangeRates,
      RMB: 1,
      USD: Number((1 / payload.rates.USD).toFixed(6)),
      MYR: Number((1 / payload.rates.MYR).toFixed(6))
    };

    exchangeSyncMeta = {
      lastSyncAt: new Date().toLocaleString("zh-CN"),
      lastSyncDate: today,
      lastSyncSource: EXCHANGE_RATE_API_URL
    };

    persistExchangeRates();
    persistExchangeSyncMeta();
    renderExchangeRatePanel();
    syncExchangeRateWithCurrency(true);
    renderResults();
    renderExchangeSyncStatus("已自动更新");
  } catch (error) {
    renderExchangeSyncStatus("同步失败，使用本地汇率");
  }
}
