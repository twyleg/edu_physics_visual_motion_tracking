#!/usr/bin/env python3
import sys
import numpy as np
import pandas as pd
import statsmodels.api as sm
import matplotlib.pyplot as plt

def rmse(y, yhat):
    return np.sqrt(np.mean((y - yhat) ** 2))

def main():
    if len(sys.argv) != 2:
        print("Usage: python analyse_schlitten.py <daten.csv>")
        sys.exit(1)

    csv_path = sys.argv[1]

    # --- Daten einlesen
    df = pd.read_csv(csv_path)

    if not {"time_seconds", "position_m"}.issubset(df.columns):
        raise ValueError("CSV muss die Spalten 'time_seconds' und 'position_m' enthalten")

    t = df["time_seconds"].to_numpy()
    x = df["position_m"].to_numpy()

    # Zeit-Nullpunkt setzen (numerisch stabiler)
    t0 = t[0]
    dt = t - t0

    # --- Linearer Fit: x = x0 + v*dt
    X_lin = sm.add_constant(dt)
    model_lin = sm.OLS(x, X_lin).fit()
    xhat_lin = model_lin.predict(X_lin)

    # --- Quadratischer Fit: x = c0 + c1*dt + c2*dt^2
    X_quad = np.column_stack([np.ones_like(dt), dt, dt**2])
    model_quad = sm.OLS(x, X_quad).fit()
    xhat_quad = model_quad.predict(X_quad)

    # --- Physikalische Größen
    v = model_lin.params[1]
    v_se = model_lin.bse[1]

    c0, c1, c2 = model_quad.params
    c0_se, c1_se, c2_se = model_quad.bse

    a_eff = 2 * c2
    a_eff_se = 2 * c2_se

    g = 9.81
    eff_ratio = abs(a_eff) / g
    eff_deg = eff_ratio * 180 / np.pi

    # --- Ausgabe
    print("\n=== Datensatz ===")
    print(f"Datei: {csv_path}")
    print(f"Messpunkte: {len(df)}")
    print(f"t0 = {t0:.4f} s\n")

    print("=== Linearer Fit: x = x0 + v·Δt ===")
    print(f"v = {v:.6f} ± {v_se:.6f} m/s")
    print(f"R² = {model_lin.rsquared:.9f}")
    print(f"RMSE = {rmse(x, xhat_lin):.6f} m")
    print(f"AIC = {model_lin.aic:.3f}, BIC = {model_lin.bic:.3f}\n")

    print("=== Quadratischer Fit: x = c0 + c1·Δt + c2·Δt² ===")
    print(f"c0 = {c0:.6f} ± {c0_se:.6f} m")
    print(f"c1 = {c1:.6f} ± {c1_se:.6f} m/s")
    print(f"c2 = {c2:.6f} ± {c2_se:.6f} m/s²")
    print(f"Restbeschleunigung a = {a_eff:.6f} ± {a_eff_se:.6f} m/s²")
    print(f"R² = {model_quad.rsquared:.9f}")
    print(f"RMSE = {rmse(x, xhat_quad):.6f} m")
    print(f"p-Wert (Quadratterm) = {model_quad.pvalues[2]:.3e}\n")

    print("=== Physikalische Einordnung ===")
    print(f"|a| / g = {eff_ratio:.6e}")
    print(f"entspricht ca. {eff_deg:.4f}° effektiver Neigungsabweichung")
    print("Vorzeichen a < 0: Reibung überwiegt leicht\n")

    # --- Plots
    plt.figure()
    plt.plot(t, x, "o", label="Messdaten")
    plt.plot(t, xhat_lin, label="Linearer Fit")
    plt.plot(t, xhat_quad, label="Quadratischer Fit")
    plt.xlabel("Zeit t [s]")
    plt.ylabel("Position x [m]")
    plt.legend()
    plt.tight_layout()

    plt.figure()
    plt.plot(t, x - xhat_lin, "o", label="Residuen linear")
    plt.axhline(0)
    plt.xlabel("Zeit t [s]")
    plt.ylabel("x − x̂ [m]")
    plt.legend()
    plt.tight_layout()

    plt.figure()
    plt.plot(t, x - xhat_quad, "o", label="Residuen quadratisch")
    plt.axhline(0)
    plt.xlabel("Zeit t [s]")
    plt.ylabel("x − x̂ [m]")
    plt.legend()
    plt.tight_layout()

    plt.show()

if __name__ == "__main__":
    main()
