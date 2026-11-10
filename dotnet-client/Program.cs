using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Tfw.TicketSales.Client;

namespace Tfw.TicketSales.Demo
{
    internal class Program
    {
        static async Task Main(string[] args)
        {
            Console.WriteLine("=============================================================");
            Console.WriteLine("  TOGGI FUN WORLD - .NET TICKET SALES & TURNSTILE CLIENT    ");
            Console.WriteLine("=============================================================\n");

            // 1. Initialize Options (Can point to local Standalone API or Cloud App URL)
            var options = new TfwTicketApiOptions
            {
                BaseUrl = "https://ais-pre-yh2u4e4b5lyucgbmyxk2sv-662885913055.asia-southeast1.run.app", // or "http://localhost:5000"
                ApiKey = "tfw-full-access-key-2026",
                DefaultSenderName = "Bashundhara Gate 1 .NET Turnstile Controller"
            };

            using var client = new TfwTicketApiClient(options);

            try
            {
                // Step 1: Query Available Counters
                Console.WriteLine("1. Fetching Theme Park Counters...");
                var countersResponse = await client.GetCountersAsync();
                Console.WriteLine($"   Found {countersResponse.Counters.Count} counters configured. Today's Date: {countersResponse.OperationalDate}\n");

                foreach (var counter in countersResponse.Counters)
                {
                    Console.WriteLine($"   - [ID: {counter.Id,4}] {counter.Name,-25} | Tariff: {counter.TicketPrice,4} BDT | Today Count: {counter.TodayCount,4}");
                }

                // Step 2: Record a Turnstile Barcode Scan or Cashier Sale
                Console.WriteLine("\n2. Recording Ticket Sale (Counter 1, 2 Tickets)...");
                var saleResult = await client.RecordSaleAsync(
                    counterId: 1,
                    count: 2,
                    notes: "Turnstile QR Code Scan #883910"
                );

                Console.WriteLine($"   [SUCCESS] Status: {saleResult.Message}");
                Console.WriteLine($"   Previous: {saleResult.PreviousCount} -> New Total: {saleResult.NewTotalCount} tickets");
                Console.WriteLine($"   Calculated Revenue: {saleResult.SubtotalRevenue:N0} BDT\n");

                // Step 3: Void / Refund a Ticket
                Console.WriteLine("3. Testing Refund / Void Transaction...");
                var refundResult = await client.RefundAsync(
                    counterId: 1,
                    count: 1,
                    reason: "Guest requested cancellation / rain voucher",
                    authorizedBy: "Manager Tanvir"
                );
                Console.WriteLine($"   [REFUND PROCESSED] New Total: {refundResult.NewTotalCount} tickets. Refund: {refundResult.RefundAmount} BDT\n");

                // Step 4: Reconcile Turnstiles vs POS Counter Sales
                Console.WriteLine("4. Running Turnstile Footfall Audit Reconciliation...");
                var turnstileData = new Dictionary<int, int>
                {
                    { 1, 15 },   // Turnstile scanned 15 people
                    { 101, 40 }  // Atrium scanned 40 people
                };

                var reconcileResult = await client.ReconcileTurnstilesAsync(turnstileData, applyAdjustment: false);
                Console.WriteLine($"   Evaluated {reconcileResult.Report.Count} counters:");
                foreach (var item in reconcileResult.Report)
                {
                    Console.WriteLine($"   - {item.CounterName}: Registered={item.RegisteredSales}, Turnstile={item.TurnstileFootfall}, Variance={item.Variance} ({item.Status})");
                }

                // Step 5: Download Complete CSV Export
                Console.WriteLine("\n5. Exporting Ticket Sales CSV...");
                var csv = await client.ExportCsvAsync();
                var firstLine = csv.Split('\n')[0];
                Console.WriteLine($"   [CSV Downloaded] Header: {firstLine}");
                Console.WriteLine($"   Total CSV Size: {csv.Length} bytes.");

                Console.WriteLine("\n=============================================================");
                Console.WriteLine("  All .NET calls executed successfully!");
                Console.WriteLine("=============================================================");
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"\n[ERROR]: {ex.Message}");
                Console.ResetColor();
            }

            Console.WriteLine("\nPress any key to exit...");
            Console.ReadKey();
        }
    }
}
