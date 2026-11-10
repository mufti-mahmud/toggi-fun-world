# Toggi Fun World - .NET (C#) Client Integration Guide

This package provides a ready-to-use C# client for communicating with the Toggi Fun World Ticket Sales & Turnstile REST API from **.NET 6 / 7 / 8 / 9**, **WPF**, **Windows Forms**, **ASP.NET Core**, or **Console Applications**.

---

## 📦 How to Add to Your .NET Project

### Method 1: Drop-In File (Fastest)
Copy `TfwTicketApiClient.cs` directly into your C# project. It has zero third-party dependencies and uses built-in `System.Net.Http` and `System.Text.Json`.

### Method 2: ASP.NET Core Dependency Injection
In your `Program.cs` or `Startup.cs`:

```csharp
builder.Services.AddSingleton<ITfwTicketApiClient>(sp =>
{
    return new TfwTicketApiClient(new TfwTicketApiOptions
    {
        // Standalone Server or Cloud Server
        BaseUrl = builder.Configuration["TfwTicketApi:BaseUrl"] ?? "http://localhost:5000",
        ApiKey = builder.Configuration["TfwTicketApi:ApiKey"] ?? "tfw-full-access-key-2026",
        DefaultSenderName = "Turnstile Controller #1"
    });
});
```

Then inject `ITfwTicketApiClient` into any Controller, Service, or Background Worker:

```csharp
[ApiController]
[Route("api/[controller]")]
public class TurnstileController : ControllerBase
{
    private readonly ITfwTicketApiClient _ticketClient;

    public TurnstileController(ITfwTicketApiClient ticketClient)
    {
        _ticketClient = ticketClient;
    }

    [HttpPost("scan")]
    public async Task<IActionResult> ScanQrCode([FromBody] ScanRequest request)
    {
        // Increment ticket counter in TFW API
        var result = await _ticketClient.RecordSaleAsync(
            counterId: 1,
            count: 1,
            notes: $"Turnstile entry for Ticket {request.Barcode}"
        );

        return Ok(new { success = true, newCount = result.NewTotalCount });
    }
}
```

---

## 🛠️ Code Examples

### 1. Record Ticket Sale / Turnstile Entry
```csharp
var client = new TfwTicketApiClient(new TfwTicketApiOptions
{
    BaseUrl = "http://localhost:5000",
    ApiKey = "tfw-full-access-key-2026"
});

var result = await client.RecordSaleAsync(counterId: 1, count: 5);
Console.WriteLine($"Updated Total: {result.NewTotalCount}");
```

### 2. Override / Set Exact Count (PUT)
```csharp
var result = await client.SetCountAsync(counterId: 1, newCount: 150);
```

### 3. Void / Refund Tickets
```csharp
var refund = await client.RefundAsync(
    counterId: 1, 
    count: 2, 
    reason: "Guest canceled trip", 
    authorizedBy: "Manager Tanvir"
);
```

### 4. Fetch Live Theme Park Counters & Tariffs
```csharp
var counters = await client.GetCountersAsync();
foreach (var c in counters.Counters)
{
    Console.WriteLine($"{c.Name}: {c.TodayCount} tickets ({c.TodayRevenue} BDT)");
}
```

### 5. Reconcile Turnstiles vs POS Sales
```csharp
var turnstileReadings = new Dictionary<int, int>
{
    { 1, 105 },  // Scanner saw 105 people
    { 101, 230 }
};

var reconcile = await client.ReconcileTurnstilesAsync(turnstileReadings, applyAdjustment: false);
```

### 6. Export Sales Spreadsheet (CSV)
```csharp
string csv = await client.ExportCsvAsync();
await File.WriteAllTextAsync("C:\\Reports\\sales.csv", csv);
```
