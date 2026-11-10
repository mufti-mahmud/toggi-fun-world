using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

namespace Tfw.TicketSales.Client
{
    /// <summary>
    /// Configuration options for the TFW Ticket Sales API Client.
    /// </summary>
    public class TfwTicketApiOptions
    {
        /// <summary>
        /// Base URL of the API (e.g. "http://localhost:5000" or the Cloud URL).
        /// </summary>
        public string BaseUrl { get; set; } = "http://localhost:5000";

        /// <summary>
        /// Master API Key for authentication.
        /// </summary>
        public string ApiKey { get; set; } = "tfw-full-access-key-2026";

        /// <summary>
        /// Default operator or application name (e.g. ".NET Turnstile Service").
        /// </summary>
        public string DefaultSenderName { get; set; } = ".NET Turnstile POS";

        /// <summary>
        /// HTTP request timeout.
        /// </summary>
        public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(30);
    }

    #region --- Data Transfer Objects (DTOs) ---

    public class CounterDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;

        [JsonPropertyName("location")]
        public string Location { get; set; } = string.Empty;

        [JsonPropertyName("unitPrice")]
        public decimal UnitPrice { get; set; }

        [JsonPropertyName("ticketPrice")]
        public decimal TicketPrice { get; set; }

        [JsonPropertyName("count")]
        public int Count { get; set; }

        [JsonPropertyName("subtotal")]
        public decimal Subtotal { get; set; }

        [JsonPropertyName("todayCount")]
        public int TodayCount { get; set; }

        [JsonPropertyName("todayRevenue")]
        public decimal TodayRevenue { get; set; }

        [JsonPropertyName("active")]
        public bool Active { get; set; }
    }

    public class TicketSalesQueryResponse
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("date")]
        public string Date { get; set; } = string.Empty;

        [JsonPropertyName("totalTicketsSold")]
        public int TotalTicketsSold { get; set; }

        [JsonPropertyName("totalRevenue")]
        public decimal TotalRevenue { get; set; }

        [JsonPropertyName("currency")]
        public string Currency { get; set; } = "BDT";

        [JsonPropertyName("counters")]
        public List<CounterDto> Counters { get; set; } = new();
    }

    public class TicketSaleResult
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("fullAccess")]
        public bool FullAccess { get; set; }

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("date")]
        public string Date { get; set; } = string.Empty;

        [JsonPropertyName("counterId")]
        public int CounterId { get; set; }

        [JsonPropertyName("counterName")]
        public string CounterName { get; set; } = string.Empty;

        [JsonPropertyName("delta")]
        public int Delta { get; set; }

        [JsonPropertyName("previousCount")]
        public int PreviousCount { get; set; }

        [JsonPropertyName("newTotalCount")]
        public int NewTotalCount { get; set; }

        [JsonPropertyName("unitPrice")]
        public decimal UnitPrice { get; set; }

        [JsonPropertyName("subtotalRevenue")]
        public decimal SubtotalRevenue { get; set; }
    }

    public class RefundResult
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("date")]
        public string Date { get; set; } = string.Empty;

        [JsonPropertyName("counterId")]
        public int CounterId { get; set; }

        [JsonPropertyName("counterName")]
        public string CounterName { get; set; } = string.Empty;

        [JsonPropertyName("refundQuantity")]
        public int RefundQuantity { get; set; }

        [JsonPropertyName("refundAmount")]
        public decimal RefundAmount { get; set; }

        [JsonPropertyName("previousCount")]
        public int PreviousCount { get; set; }

        [JsonPropertyName("newTotalCount")]
        public int NewTotalCount { get; set; }

        [JsonPropertyName("reason")]
        public string Reason { get; set; } = string.Empty;

        [JsonPropertyName("authorizedBy")]
        public string AuthorizedBy { get; set; } = string.Empty;
    }

    public class ReconcileItem
    {
        [JsonPropertyName("counterId")]
        public int CounterId { get; set; }

        [JsonPropertyName("counterName")]
        public string CounterName { get; set; } = string.Empty;

        [JsonPropertyName("registeredSales")]
        public int RegisteredSales { get; set; }

        [JsonPropertyName("turnstileFootfall")]
        public int TurnstileFootfall { get; set; }

        [JsonPropertyName("variance")]
        public int Variance { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;
    }

    public class ReconcileResult
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("date")]
        public string Date { get; set; } = string.Empty;

        [JsonPropertyName("adjustmentsApplied")]
        public bool AdjustmentsApplied { get; set; }

        [JsonPropertyName("report")]
        public List<ReconcileItem> Report { get; set; } = new();
    }

    public class BatchSaleItem
    {
        [JsonPropertyName("counterId")]
        public int CounterId { get; set; }

        [JsonPropertyName("count")]
        public int Count { get; set; }

        [JsonPropertyName("action")]
        public string Action { get; set; } = "increment";
    }

    public class UniversalActionRequest
    {
        [JsonPropertyName("action")]
        public string Action { get; set; } = "increment"; // increment | set | refund | reset | query

        [JsonPropertyName("counterId")]
        public int? CounterId { get; set; }

        [JsonPropertyName("count")]
        public int? Count { get; set; }

        [JsonPropertyName("date")]
        public string? Date { get; set; }

        [JsonPropertyName("soldBy")]
        public string? SoldBy { get; set; }

        [JsonPropertyName("reason")]
        public string? Reason { get; set; }

        [JsonPropertyName("notes")]
        public string? Notes { get; set; }

        [JsonPropertyName("unitPrice")]
        public decimal? UnitPrice { get; set; }
    }

    public class CountersResponse
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("operationalDate")]
        public string OperationalDate { get; set; } = string.Empty;

        [JsonPropertyName("totalCounters")]
        public int TotalCounters { get; set; }

        [JsonPropertyName("counters")]
        public List<CounterDto> Counters { get; set; } = new();
    }

    #endregion

    /// <summary>
    /// Service Interface for TFW Ticket Sales & Turnstiles API.
    /// </summary>
    public interface ITfwTicketApiClient
    {
        Task<TicketSalesQueryResponse> GetSalesAsync(string? date = null, CancellationToken ct = default);
        Task<TicketSaleResult> RecordSaleAsync(int counterId, int count = 1, string? date = null, string? soldBy = null, string? notes = null, CancellationToken ct = default);
        Task<TicketSaleResult> SetCountAsync(int counterId, int newCount, string? date = null, string? soldBy = null, CancellationToken ct = default);
        Task<RefundResult> RefundAsync(int counterId, int count, string reason, string authorizedBy, string? date = null, CancellationToken ct = default);
        Task<TicketSaleResult> ResetCounterAsync(int counterId, string reason = "Daily Reset", string? date = null, CancellationToken ct = default);
        Task<ReconcileResult> ReconcileTurnstilesAsync(Dictionary<int, int> turnstileReadings, bool applyAdjustment = false, string? date = null, CancellationToken ct = default);
        Task<CountersResponse> GetCountersAsync(CancellationToken ct = default);
        Task<string> ExportCsvAsync(string? startDate = null, string? endDate = null, CancellationToken ct = default);
        Task<JsonElement> ExecuteActionAsync(UniversalActionRequest request, CancellationToken ct = default);
    }

    /// <summary>
    /// Production-ready .NET HTTP Client for TFW Ticket Sales API.
    /// </summary>
    public class TfwTicketApiClient : ITfwTicketApiClient, IDisposable
    {
        private readonly HttpClient _httpClient;
        private readonly bool _ownsHttpClient;
        private readonly TfwTicketApiOptions _options;
        private readonly JsonSerializerOptions _jsonOptions;

        public TfwTicketApiClient(TfwTicketApiOptions options, HttpClient? httpClient = null)
        {
            _options = options ?? throw new ArgumentNullException(nameof(options));
            _ownsHttpClient = httpClient == null;
            _httpClient = httpClient ?? new HttpClient();

            var baseUri = options.BaseUrl.TrimEnd('/') + "/";
            _httpClient.BaseAddress = new Uri(baseUri);
            _httpClient.Timeout = options.Timeout;

            // Configure Master API Key Header
            if (!string.IsNullOrWhiteSpace(options.ApiKey))
            {
                if (_httpClient.DefaultRequestHeaders.Contains("x-api-key"))
                {
                    _httpClient.DefaultRequestHeaders.Remove("x-api-key");
                }
                _httpClient.DefaultRequestHeaders.Add("x-api-key", options.ApiKey);
            }

            _jsonOptions = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
                DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
            };
        }

        public async Task<TicketSalesQueryResponse> GetSalesAsync(string? date = null, CancellationToken ct = default)
        {
            var url = string.IsNullOrWhiteSpace(date) ? "api/ticket-sales" : $"api/ticket-sales?date={Uri.EscapeDataString(date)}";
            var response = await _httpClient.GetAsync(url, ct).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            return JsonSerializer.Deserialize<TicketSalesQueryResponse>(json, _jsonOptions) ?? new TicketSalesQueryResponse();
        }

        public async Task<TicketSaleResult> RecordSaleAsync(int counterId, int count = 1, string? date = null, string? soldBy = null, string? notes = null, CancellationToken ct = default)
        {
            var payload = new
            {
                counterId,
                count,
                action = "increment",
                date,
                soldBy = soldBy ?? _options.DefaultSenderName,
                notes
            };

            return await PostJsonAsync<TicketSaleResult>("api/ticket-sales", payload, ct).ConfigureAwait(false);
        }

        public async Task<TicketSaleResult> SetCountAsync(int counterId, int newCount, string? date = null, string? soldBy = null, CancellationToken ct = default)
        {
            var payload = new
            {
                counterId,
                count = newCount,
                action = "set",
                date,
                soldBy = soldBy ?? _options.DefaultSenderName
            };

            return await PostJsonAsync<TicketSaleResult>("api/ticket-sales", payload, ct).ConfigureAwait(false);
        }

        public async Task<RefundResult> RefundAsync(int counterId, int count, string reason, string authorizedBy, string? date = null, CancellationToken ct = default)
        {
            var payload = new
            {
                counterId,
                count,
                reason,
                authorizedBy,
                date
            };

            return await PostJsonAsync<RefundResult>("api/ticket-sales/refund", payload, ct).ConfigureAwait(false);
        }

        public async Task<TicketSaleResult> ResetCounterAsync(int counterId, string reason = "Daily Reset", string? date = null, CancellationToken ct = default)
        {
            var request = new UniversalActionRequest
            {
                Action = "reset",
                CounterId = counterId,
                Date = date,
                Reason = reason
            };

            var jsonElement = await ExecuteActionAsync(request, ct).ConfigureAwait(false);
            return JsonSerializer.Deserialize<TicketSaleResult>(jsonElement.GetRawText(), _jsonOptions) ?? new TicketSaleResult();
        }

        public async Task<ReconcileResult> ReconcileTurnstilesAsync(Dictionary<int, int> turnstileReadings, bool applyAdjustment = false, string? date = null, CancellationToken ct = default)
        {
            var payload = new
            {
                turnstileReadings,
                applyAdjustment,
                date,
                authorizedBy = _options.DefaultSenderName
            };

            return await PostJsonAsync<ReconcileResult>("api/ticket-sales/reconcile", payload, ct).ConfigureAwait(false);
        }

        public async Task<CountersResponse> GetCountersAsync(CancellationToken ct = default)
        {
            var response = await _httpClient.GetAsync("api/ticket-sales/counters", ct).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            return JsonSerializer.Deserialize<CountersResponse>(json, _jsonOptions) ?? new CountersResponse();
        }

        public async Task<string> ExportCsvAsync(string? startDate = null, string? endDate = null, CancellationToken ct = default)
        {
            var query = new List<string> { "format=csv" };
            if (!string.IsNullOrWhiteSpace(startDate)) query.Add($"startDate={Uri.EscapeDataString(startDate)}");
            if (!string.IsNullOrWhiteSpace(endDate)) query.Add($"endDate={Uri.EscapeDataString(endDate)}");

            var url = "api/ticket-sales/export?" + string.Join("&", query);
            var response = await _httpClient.GetAsync(url, ct).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();

            return await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        }

        public async Task<JsonElement> ExecuteActionAsync(UniversalActionRequest request, CancellationToken ct = default)
        {
            var content = new StringContent(JsonSerializer.Serialize(request, _jsonOptions), Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync("api/ticket-sales/action", content, ct).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.Clone();
        }

        private async Task<T> PostJsonAsync<T>(string uri, object payload, CancellationToken ct)
        {
            var content = new StringContent(JsonSerializer.Serialize(payload, _jsonOptions), Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync(uri, content, ct).ConfigureAwait(false);
            var json = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException($"API request failed with status {response.StatusCode}: {json}");
            }

            return JsonSerializer.Deserialize<T>(json, _jsonOptions) ?? Activator.CreateInstance<T>();
        }

        public void Dispose()
        {
            if (_ownsHttpClient)
            {
                _httpClient.Dispose();
            }
        }
    }
}
