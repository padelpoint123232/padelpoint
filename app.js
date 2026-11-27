
import { supabase } from "./supabase.js";

let partidos = [];
let parejas = [];
let productos = [];
let categorias = [];
let enfrentamientos = [];
let configuracion = {};
let categoriaActual = "todos";
let temporizador;

// SEGURIDAD DEL CONTENIDO

function seguro(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[c]);
}

function imagenSegura(valor) {
    try {
        const url = new URL(valor);
        return url.protocol === "https:" ? url.href : "";
    } catch {
        return "";
    }
}

function dinero(valor) {
    return Number(valor || 0).toFixed(2);
}

function notificar(mensaje) {
    const aviso = document.getElementById("notificacion");

    aviso.textContent = mensaje;
    aviso.hidden = false;

    clearTimeout(temporizador);

    temporizador = setTimeout(() => {
        aviso.hidden = true;
    }, 4500);
}

// CARGAR BASE DE DATOS

async function cargarDatos() {
    try {
        const resultados = await Promise.all([
            supabase.from("partidos").select("*")
                .order("fecha").order("hora"),

            supabase.from("parejas").select("*")
                .order("creado_en"),

            supabase.from("productos").select("*")
                .eq("publicado", true)
                .order("destacado", { ascending: false }),

            supabase.from("categorias").select("*")
                .order("nombre"),

            supabase.from("enfrentamientos").select("*")
                .eq("publicado", true)
                .order("turno").order("cancha"),

            supabase.from("configuracion").select("*")
                .eq("id", 1).single()
        ]);

        for (const resultado of resultados) {
            if (resultado.error) throw resultado.error;
        }

        partidos = resultados[0].data || [];
        parejas = resultados[1].data || [];
        productos = resultados[2].data || [];
        categorias = resultados[3].data || [];
        enfrentamientos = resultados[4].data || [];
        configuracion = resultados[5].data || {};

        mostrarPartidos();
        mostrarEnfrentamientos();
        mostrarCategorias();
        mostrarProductos();
        mostrarEstadisticas();
        mostrarContacto();

    } catch (error) {
        console.error(error);

        for (const id of [
            "lista-partidos",
            "lista-productos",
            "lista-enfrentamientos"
        ]) {
            document.getElementById(id).innerHTML =
                '<div class="empty">No se pudieron cargar los datos. Intenta actualizar la página.</div>';
        }

        notificar("Error de conexión con Supabase.");
    }
}

// PARTIDOS

function mostrarPartidos() {
    const contenedor = document.getElementById("lista-partidos");

    const disponibles = partidos.filter(
        p => p.estado !== "finalizado"
    );

    if (!disponibles.length) {
        contenedor.innerHTML = `
            <div class="empty">
                Todavía no hay partidos disponibles.
                ¡Pronto tendremos nuevos encuentros!
            </div>
        `;
        return;
    }

    contenedor.innerHTML = disponibles.map(p => {

        const inscritos = parejas.filter(
            pareja => pareja.partido_id === p.id
        );

        const ocupados = inscritos.reduce(
            (total, pareja) =>
                total + (pareja.jugador2 ? 2 : 1),
            0
        );

        const libres = Math.max(0, p.cupos - ocupados);

        const porcentaje = Math.min(
            100, ocupados / p.cupos * 100
        );

        const abierto =
            p.estado === "abierto" && libres > 0;

        return `
            <article class="match-card">

                <span class="badge">
                    ${seguro(p.categoria)}
                </span>

                <h3>${seguro(p.titulo)}</h3>

                <div class="match-details">
                    <span>📅 ${seguro(p.fecha.split("-").reverse().join("/"))}</span>
                    <span>🕒 ${seguro(p.hora.slice(0,5))}</span>
                    <span>📍 ${seguro(p.lugar)}</span>
                    <span>🎾 ${p.canchas} cancha(s)</span>
                </div>

                <div class="price">
                    $${dinero(p.precio)}
                </div>

                ${p.premio ? `
                    <p>🏆 Premio: ${seguro(p.premio)}</p>
                ` : ""}

                <div class="capacity">
                    <strong>${ocupados}/${p.cupos} inscritos</strong>
                    <span>${libres} disponibles</span>
                </div>

                <div class="progress-bar">
                    <span style="width:${porcentaje}%"></span>
                </div>

                <div class="pairs-list">

                    <strong>Jugadores inscritos</strong>

                    ${inscritos.length ? inscritos.map((par, i) => `
                        <div class="pair-item">
                            <strong>Pareja ${i + 1}</strong><br>
                            ${seguro(par.jugador1)}
                            +
                            ${seguro(par.jugador2 || "Esperando pareja")}
                        </div>
                    `).join("") : `
                        <p>Aún no hay inscritos.</p>
                    `}

                </div>

                ${abierto ? `

                    <form class="signup-form"
                          data-partido="${seguro(p.id)}">

                        <select name="tipo">
                            <option value="individual">
                                Inscripción individual
                            </option>
                            ${libres >= 2 ? `
                                <option value="pareja">
                                    Inscripción en pareja
                                </option>
                            ` : ""}
                        </select>

                        <input name="jugador1"
                               placeholder="Nombre del jugador"
                               minlength="2"
                               maxlength="70"
                               required>

                        <input name="jugador2"
                               placeholder="Nombre de tu pareja"
                               minlength="2"
                               maxlength="70"
                               style="display:none"
                               disabled>

                        <button class="btn" type="submit">
                            Inscribirme →
                        </button>

                    </form>

                ` : `
                    <button class="btn" disabled>
                        ${libres === 0 ?
                            "Cupos completos" :
                            "Inscripciones cerradas"}
                    </button>
                `}

            </article>
        `;

    }).join("");

    contenedor.querySelectorAll(".signup-form")
        .forEach(formulario => {

            const tipo = formulario.elements.tipo;
            const segundo = formulario.elements.jugador2;

            tipo.addEventListener("change", () => {
                const esPareja = tipo.value === "pareja";

                segundo.style.display =
                    esPareja ? "block" : "none";

                segundo.required = esPareja;
                segundo.disabled = !esPareja;
            });

            formulario.addEventListener(
                "submit", inscribirJugadores
            );
        });
}

// INSCRIPCIONES

async function inscribirJugadores(evento) {
    evento.preventDefault();

    const formulario = evento.currentTarget;
    const boton = formulario.querySelector("button");

    const jugador1 =
        formulario.elements.jugador1.value.trim();

    const jugador2 =
        formulario.elements.tipo.value === "pareja"
        ? formulario.elements.jugador2.value.trim()
        : null;

    boton.disabled = true;
    boton.textContent = "Inscribiendo...";

    try {
        const { data, error } = await supabase.rpc(
            "inscribir_jugadores",
            {
                p_partido_id: formulario.dataset.partido,
                p_jugador1: jugador1,
                p_jugador2: jugador2
            }
        );

        if (error) throw error;

        formulario.reset();

        await cargarDatos();

        notificar(data || "Inscripción exitosa.");

    } catch (error) {
        notificar(error.message || "Error de inscripción.");

    } finally {
        boton.disabled = false;
        boton.textContent = "Inscribirme →";
    }
}

// ENFRENTAMIENTOS

function nombrePareja(id) {
    const pareja = parejas.find(p => p.id === id);

    if (!pareja) return "Por definir";

    return pareja.jugador1 + " / " +
        (pareja.jugador2 || "Por definir");
}

function mostrarEnfrentamientos() {
    const contenedor =
        document.getElementById("lista-enfrentamientos");

    const publicados = partidos.filter(p =>
        enfrentamientos.some(e => e.partido_id === p.id)
    );

    if (!publicados.length) {
        contenedor.innerHTML = `
            <div class="empty">
                Todavía no hay enfrentamientos publicados.
            </div>
        `;
        return;
    }

    contenedor.innerHTML = publicados.map(p => {

        const juegos = enfrentamientos.filter(
            e => e.partido_id === p.id
        );

        return `
            <article class="fixture-card">

                <h3>${seguro(p.titulo)}</h3>

                <table>
                    <thead>
                        <tr>
                            <th>Turno</th>
                            <th>Cancha</th>
                            <th>Grupo</th>
                            <th>Pareja 1</th>
                            <th>Pareja 2</th>
                            <th>Resultado</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${juegos.map(e => `
                            <tr>
                                <td>${e.turno}</td>
                                <td>${e.cancha}</td>
                                <td>${seguro(e.grupo || "General")}</td>
                                <td>${seguro(nombrePareja(e.pareja1_id))}</td>
                                <td>${seguro(nombrePareja(e.pareja2_id))}</td>
                                <td>
                                    ${e.puntos1 !== null &&
                                      e.puntos2 !== null
                                        ? `${e.puntos1} - ${e.puntos2}`
                                        : "Pendiente"}
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>

            </article>
        `;

    }).join("");
}

// CATEGORIAS

function mostrarCategorias() {
    const contenedor =
        document.getElementById("filtros-categorias");

    contenedor.innerHTML = `
        <button class="filter"
                data-categoria="todos">
            Todos
        </button>

        ${categorias.map(c => `
            <button class="filter"
                    data-categoria="${seguro(c.id)}">
                ${seguro(c.nombre)}
            </button>
        `).join("")}
    `;

    contenedor.querySelectorAll("button")
        .forEach(boton => {

            boton.classList.toggle(
                "active",
                boton.dataset.categoria === categoriaActual
            );

            boton.addEventListener("click", () => {

                categoriaActual = boton.dataset.categoria;

                mostrarCategorias();
                mostrarProductos();
            });
        });
}

// WHATSAPP

function numeroWhatsapp() {
    const numero = String(
        configuracion.whatsapp || ""
    ).replace(/\D/g, "");

    return /^[1-9]\d{7,14}$/.test(numero)
        ? numero : "";
}

function enlaceWhatsapp(producto) {
    const numero = numeroWhatsapp();

    if (!numero) return "";

    const mensaje =
        `Hola, Padel Point. Estoy interesado en ` +
        `${producto.nombre} de $${dinero(producto.precio)}. ` +
        `¿Me pueden dar más información?`;

    return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

// TIENDA

function mostrarProductos() {
    const contenedor =
        document.getElementById("lista-productos");

    const filtrados = productos.filter(p =>
        categoriaActual === "todos" ||
        p.categoria_id === categoriaActual
    );

    if (!filtrados.length) {
        contenedor.innerHTML = `
            <div class="empty">
                Próximamente tendremos nuevos productos.
            </div>
        `;
        return;
    }

    contenedor.innerHTML = filtrados.map(p => {

        const categoria = categorias.find(
            c => c.id === p.categoria_id
        );

        const enlace = enlaceWhatsapp(p);
        const imagen = imagenSegura(p.imagen);
        const comprar = p.disponible && enlace;

        return `
            <article class="product-card">

                ${comprar ? `
                    <a href="${seguro(enlace)}"
                       target="_blank"
                       rel="noopener noreferrer">
                ` : ""}

                ${imagen ? `
                    <img src="${seguro(imagen)}"
                         alt="${seguro(p.nombre)}"
                         loading="lazy">
                ` : `
                    <div style="padding:55px 15px;text-align:center;font-size:55px">
                        🎾
                    </div>
                `}

                <div class="product-info">

                    <span class="badge">
                        ${seguro(categoria?.nombre || "Pádel")}
                    </span>

                    <h3>${seguro(p.nombre)}</h3>

                    <p>${seguro(p.descripcion || "")}</p>

                    <div class="price">
                        $${dinero(p.precio)}
                    </div>

                    ${comprar ? `
                        <span class="whatsapp-btn">
                            Comprar por WhatsApp
                        </span>
                    ` : `
                        <button class="btn" disabled>
                            ${p.disponible ?
                                "Contacto no configurado" :
                                "Agotado"}
                        </button>
                    `}

                </div>

                ${comprar ? "</a>" : ""}

            </article>
        `;

    }).join("");
}

// ESTADISTICAS

function mostrarEstadisticas() {
    document.getElementById("total-partidos")
        .textContent = partidos.length;

    document.getElementById("total-jugadores")
        .textContent = parejas.reduce(
            (total, p) =>
                total + (p.jugador2 ? 2 : 1),
            0
        );

    document.getElementById("total-enfrentamientos")
        .textContent = enfrentamientos.length;
}

// CONTACTO

function mostrarContacto() {
    const contenedor =
        document.getElementById("contacto-club");

    const numero = numeroWhatsapp();

    contenedor.innerHTML = `
        ${numero ? `
            <p>
                <a href="https://wa.me/${numero}"
                   target="_blank"
                   rel="noopener noreferrer">
                    WhatsApp
                </a>
            </p>
        ` : ""}

        ${configuracion.direccion ? `
            <p>${seguro(configuracion.direccion)}</p>
        ` : ""}
    `;
}

// INICIAR PAGINA

cargarDatos();
