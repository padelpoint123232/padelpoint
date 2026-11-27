
2





















































import { supabase } from "./supabase.js";

const $ = id => document.getElementById(id);

let partidos = [];
let parejas = [];
let productos = [];
let categorias = [];
let enfrentamientos = [];
let configuracion = {};
let borrador = [];
let partidoBorrador = null;
let temporizador;
let eventoResultados = "";

function seguro(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[c]);
}

function aviso(mensaje) {
    $("notificacion").textContent = mensaje;
    $("notificacion").hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
        $("notificacion").hidden = true;
    }, 4500);
}

async function consultar(peticion) {
    const { data, error } = await peticion;
    if (error) throw error;
    return data;
}

async function ejecutar(accion) {
    try {
        await accion();
    } catch (error) {
        console.error(error);
        aviso(error.message || "Ocurrió un error.");
    }
}

// AUTENTICACION

async function verificarSesion() {
    const { data } = await supabase.auth.getSession();

    $("admin-panel").hidden = true;
    $("login-section").hidden = false;

    if (!data.session) return;

    const { data: admin, error } = await supabase
        .from("administradores")
        .select("nombre")
        .eq("id", data.session.user.id)
        .maybeSingle();

    if (error || !admin) {
        await supabase.auth.signOut();
        $("login-error").textContent =
            "No tienes permisos de administrador.";
        return;
    }

    $("login-section").hidden = true;
    $("admin-panel").hidden = false;
    $("admin-name").textContent =
        "Bienvenido, " + admin.nombre;

    mostrarSeccion("dashboard");
    await cargarDatos();
}

$("login-form").addEventListener("submit", async e => {
    e.preventDefault();

    const boton = e.currentTarget.querySelector("button");
    boton.disabled = true;
    $("login-error").textContent = "";

    try {
        const { error } = await supabase.auth.signInWithPassword({
            email: $("email").value.trim(),
            password: $("password").value
        });

        if (error) throw error;

        $("password").value = "";
        await verificarSesion();

    } catch (error) {
        $("login-error").textContent =
            "No se pudo iniciar sesión: " + error.message;
    } finally {
        boton.disabled = false;
    }
});

$("logout-btn").addEventListener("click", async () => {
    await ejecutar(async () => {
        await consultar(supabase.auth.signOut());
        location.reload();
    });
});

// MENU

function mostrarSeccion(nombre) {
    document.querySelectorAll(".admin-section")
        .forEach(seccion => {
            seccion.hidden =
                seccion.id !== "section-" + nombre;
        });

    document.querySelectorAll("[data-section]")
        .forEach(boton => {
            boton.classList.toggle(
                "active",
                boton.dataset.section === nombre
            );
        });
}

document.querySelectorAll("[data-section]")
    .forEach(boton => {
        boton.addEventListener("click", () => {
            mostrarSeccion(boton.dataset.section);
        });
    });

// CARGAR DATOS

async function cargarDatos() {
    [
        partidos,
        parejas,
        productos,
        categorias,
        enfrentamientos,
        configuracion
    ] = await Promise.all([
        consultar(supabase.from("partidos")
            .select("*").order("fecha").order("hora")),
        consultar(supabase.from("parejas")
            .select("*").order("creado_en")),
        consultar(supabase.from("productos")
            .select("*").order("creado_en")),
        consultar(supabase.from("categorias")
            .select("*").order("nombre")),
        consultar(supabase.from("enfrentamientos")
            .select("*").order("turno").order("cancha")),
        consultar(supabase.from("configuracion")
            .select("*").eq("id", 1).single())
    ]);

    mostrarResumen();
    mostrarPartidos();
    actualizarSelectores();
    mostrarInscritos();
    mostrarProductos();
    mostrarCategorias();
    mostrarEnfrentamientos();
    mostrarRanking();
    mostrarConfiguracion();
}

// RESUMEN

function mostrarResumen() {
    $("admin-total-partidos").textContent =
        partidos.length;

    $("admin-total-jugadores").textContent =
        parejas.reduce(
            (total, p) => total + (p.jugador2 ? 2 : 1),
            0
        );

    $("admin-total-productos").textContent =
        productos.length;

    $("admin-total-enfrentamientos").textContent =
        enfrentamientos.length;
}

// PARTIDOS

function mostrarPartidos() {
    $("admin-lista-partidos").innerHTML =
        partidos.length ? partidos.map(p => {

            const inscritos = parejas
                .filter(x => x.partido_id === p.id)
                .reduce(
                    (n, x) => n + (x.jugador2 ? 2 : 1),
                    0
                );

            return `
                <div class="admin-item">
                    <div>
                        <h3>${seguro(p.titulo)}</h3>
                        <p>${seguro(p.categoria)}</p>
                        <p>${seguro(p.fecha)} |
                           ${seguro(p.hora.slice(0,5))}</p>
                        <p>${seguro(p.lugar)}</p>
                        <p>${inscritos}/${p.cupos} inscritos</p>
                        <p>Estado: ${seguro(p.estado)}</p>
                    </div>

                    <div class="actions">
                        <button class="btn-edit"
                            data-action="editar-partido"
                            data-id="${p.id}">
                            Editar
                        </button>

                        <button class="btn-delete"
                            data-action="eliminar-partido"
                            data-id="${p.id}">
                            Eliminar
                        </button>
                    </div>
                </div>
            `;
        }).join("") :
        '<div class="empty">No hay partidos registrados.</div>';
}

$("partido-form").addEventListener("submit", e => {
    e.preventDefault();
    const f = e.currentTarget;

    ejecutar(async () => {
        const id = f.elements.id.value;

        const datos = {
            titulo: f.elements.titulo.value.trim(),
            categoria: f.elements.categoria.value.trim(),
            fecha: f.elements.fecha.value,
            hora: f.elements.hora.value,
            lugar: f.elements.lugar.value.trim(),
            cupos: Number(f.elements.cupos.value),
            canchas: Number(f.elements.canchas.value),
            precio: Number(f.elements.precio.value),
            premio: f.elements.premio.value.trim(),
            estado: f.elements.estado.value
        };

        if (id) {
            const inscritos = parejas
                .filter(p => p.partido_id === id)
                .reduce(
                    (n, p) => n + (p.jugador2 ? 2 : 1),
                    0
                );

            if (datos.cupos < inscritos) {
                throw new Error(
                    "Los cupos no pueden ser menores a los inscritos."
                );
            }

            await consultar(
                supabase.from("partidos")
                    .update(datos).eq("id", id)
            );
        } else {
            await consultar(
                supabase.from("partidos").insert(datos)
            );
        }

        f.reset();
        f.elements.id.value = "";

        await cargarDatos();
        aviso("Partido guardado correctamente.");
    });
});

function editarPartido(id) {
    const p = partidos.find(x => x.id === id);
    if (!p) return;

    const f = $("partido-form");

    for (const campo of [
        "id", "titulo", "categoria", "fecha",
        "hora", "lugar", "cupos", "canchas",
        "precio", "premio", "estado"
    ]) {
        f.elements[campo].value = p[campo] ?? "";
    }

    f.elements.hora.value = p.hora.slice(0,5);

    mostrarSeccion("partidos");
    f.scrollIntoView({ behavior: "smooth" });
}

async function eliminarPartido(id) {
    if (!confirm(
        "¿Eliminar este partido y todos sus inscritos y enfrentamientos?"
    )) return;

    await consultar(
        supabase.from("partidos").delete().eq("id", id)
    );

    await cargarDatos();
    aviso("Partido eliminado.");
}

// SELECTORES

function actualizarSelectores() {
    for (const id of [
        "inscritos-partido",
        "fixture-partido"
    ]) {
        const select = $(id);
        const anterior = select.value;

        select.innerHTML = `
            <option value="">Seleccionar partido</option>
            ${partidos.map(p => `
                <option value="${p.id}">
                    ${seguro(p.titulo)}
                </option>
            `).join("")}
        `;

        if (partidos.some(p => p.id === anterior)) {
            select.value = anterior;
        }
    }

    const select = $("producto-categoria");
    const anterior = select.value;

    select.innerHTML = `
        <option value="">Sin categoría</option>
        ${categorias.map(c => `
            <option value="${c.id}">
                ${seguro(c.nombre)}
            </option>
        `).join("")}
    `;

    if (categorias.some(c => c.id === anterior)) {
        select.value = anterior;
    }
}

// INSCRITOS

function mostrarInscritos() {
    const id = $("inscritos-partido").value;

    const lista = parejas.filter(
        p => p.partido_id === id
    );

    $("admin-lista-inscritos").innerHTML =
        lista.length ? lista.map((p, i) => `
            <div class="admin-item">
                <div>
                    <h3>Pareja ${i + 1}</h3>
                    <p>${seguro(p.jugador1)}</p>
                    <p>${seguro(
                        p.jugador2 || "Esperando pareja"
                    )}</p>
                </div>

                <button class="btn-delete"
                    data-action="eliminar-pareja"
                    data-id="${p.id}">
                    Eliminar inscripción
                </button>
            </div>
        `).join("") :
        '<div class="empty">No hay inscritos para mostrar.</div>';
}

$("inscritos-partido").addEventListener(
    "change", mostrarInscritos
);

async function eliminarPareja(id) {
    if (enfrentamientos.some(e =>
        e.pareja1_id === id || e.pareja2_id === id
    )) {
        throw new Error(
            "Esta pareja tiene enfrentamientos. Elimínalos primero."
        );
    }

    if (!confirm("¿Eliminar esta inscripción?")) return;

    await consultar(
        supabase.from("parejas").delete().eq("id", id)
    );

    await cargarDatos();
    aviso("Inscripción eliminada.");
}

// GENERADOR DE ENFRENTAMIENTOS

function nombrePareja(id) {
    const p = parejas.find(x => x.id === id);

    return p
        ? p.jugador1 + " / " + (p.jugador2 || "")
        : "Por definir";
}

function mezclar(lista) {
    const copia = [...lista];

    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }

    return copia;
}

function generarGrupo(lista, cantidad, grupo, partidoId) {
    const n = lista.length;

    if (cantidad >= n) {
        throw new Error(
            "Hay pocas parejas para la cantidad de partidos solicitada."
        );
    }

    if ((n * cantidad) % 2 !== 0) {
        throw new Error(
            "No es posible dar la misma cantidad de partidos a todas las parejas de este grupo."
        );
    }

    const juegos = [];

    function agregar(a, b) {
        juegos.push({
            partido_id: partidoId,
            pareja1_id: lista[a].id,
            pareja2_id: lista[b].id,
            grupo,
            publicado: false
        });
    }

    for (let distancia = 1;
         distancia <= Math.floor(cantidad / 2);
         distancia++) {

        for (let i = 0; i < n; i++) {
            agregar(i, (i + distancia) % n);
        }
    }

    if (cantidad % 2 !== 0) {
        for (let i = 0; i < n / 2; i++) {
            agregar(i, i + n / 2);
        }
    }

    return juegos;
}

function asignarTurnos(juegos, canchas) {
    const turnos = [];

    for (const juego of juegos) {
        let turno = turnos.findIndex(lista =>
            lista.length < canchas &&
            !lista.some(e =>
                [e.pareja1_id, e.pareja2_id]
                    .includes(juego.pareja1_id) ||
                [e.pareja1_id, e.pareja2_id]
                    .includes(juego.pareja2_id)
            )
        );

        if (turno === -1) {
            turno = turnos.length;
            turnos.push([]);
        }

        juego.turno = turno + 1;
        juego.cancha = turnos[turno].length + 1;

        turnos[turno].push(juego);
    }

    return turnos.flat();
}

$("generador-form").addEventListener("submit", e => {
    e.preventDefault();
    const f = e.currentTarget;

    borrador = [];
    partidoBorrador = null;
    $("publicar-fixture").hidden = true;
    $("fixture-preview").innerHTML = "";

    ejecutar(async () => {
        const id = f.elements.partido_id.value;
        const grupos = Number(f.elements.grupos.value);
        const cantidad = Number(
            f.elements.partidos_por_pareja.value
        );
        const canchas = Number(f.elements.canchas.value);

        const partido = partidos.find(p => p.id === id);

        if (!partido || partido.estado !== "cerrado") {
            throw new Error(
                "Cierra las inscripciones antes de generar los enfrentamientos."
            );
        }

        if (enfrentamientos.some(x => x.partido_id === id)) {
            throw new Error(
                "Este partido ya tiene enfrentamientos registrados."
            );
        }

        if (!Number.isInteger(canchas) ||
            canchas < 1 || canchas > partido.canchas) {
            throw new Error("Número de canchas no válido.");
        }

        const inscritos = parejas.filter(
            p => p.partido_id === id
        );

        if (inscritos.some(p => !p.jugador2)) {
            throw new Error(
                "Hay jugadores que todavía no tienen pareja."
            );
        }

        const lista = mezclar(inscritos);

        if (lista.length < grupos * 2) {
            throw new Error("No hay suficientes parejas.");
        }

        const listas = grupos === 1
            ? [lista]
            : [
                lista.slice(0, Math.ceil(lista.length / 2)),
                lista.slice(Math.ceil(lista.length / 2))
            ];

        let juegos = [];

        listas.forEach((grupo, i) => {
            juegos.push(...generarGrupo(
                grupo,
                cantidad,
                grupos === 1 ? "General" : (i === 0 ? "A" : "B"),
                id
            ));
        });

        borrador = asignarTurnos(juegos, canchas);
        partidoBorrador = id;

        $("fixture-preview").innerHTML = `
            <div class="admin-card">
                <h2>Vista previa</h2>
                <p>${borrador.length} enfrentamientos</p>
                ${tablaFixture(borrador)}
            </div>
        `;

        $("publicar-fixture").hidden = false;
        aviso("Enfrentamientos generados.");
    });
});

function tablaFixture(lista) {
    return `
        <table>
            <thead>
                <tr>
                    <th>Turno</th>
                    <th>Cancha</th>
                    <th>Grupo</th>
                    <th>Pareja 1</th>
                    <th>Pareja 2</th>
                </tr>
            </thead>
            <tbody>
                ${lista.map(e => `
                    <tr>
                        <td>${e.turno}</td>
                        <td>${e.cancha}</td>
                        <td>${seguro(e.grupo)}</td>
                        <td>${seguro(nombrePareja(e.pareja1_id))}</td>
                        <td>${seguro(nombrePareja(e.pareja2_id))}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

$("publicar-fixture").addEventListener("click", () => {
    ejecutar(async () => {
        if (!borrador.length || !partidoBorrador) return;

        const boton = $("publicar-fixture");
        boton.disabled = true;

        try {
            const actuales = await consultar(
                supabase.from("enfrentamientos")
                    .select("id")
                    .eq("partido_id", partidoBorrador)
            );

            if (actuales.length) {
                throw new Error(
                    "Ya existen enfrentamientos para este partido."
                );
            }

            await consultar(
                supabase.from("enfrentamientos").insert(
                    borrador.map(e => ({
                        ...e,
                        publicado: true
                    }))
                )
            );

            eventoResultados = partidoBorrador;
            borrador = [];
            partidoBorrador = null;
            $("fixture-preview").innerHTML = "";
            boton.hidden = true;

            await cargarDatos();
            aviso("Enfrentamientos publicados.");
        } finally {
            boton.disabled = false;
        }
    });
});

// RESULTADOS

function mostrarEnfrentamientos() {
    const contenedor = $("admin-lista-enfrentamientos");
    if (!partidos.some(p => p.id === eventoResultados)) {
        eventoResultados = "";
    }
    const lista = enfrentamientos.filter(e => e.partido_id === eventoResultados);
    const grupos = [...new Set(lista.map(e => e.grupo || "General"))].sort();
    const partido = partidos.find(p => p.id === eventoResultados);
    function tarjeta(e) {
            return `
                <div class="admin-card">
                    <h3>Turno ${e.turno} · Cancha ${e.cancha}</h3>

                    <p>Turno ${e.turno} |
                       Cancha ${e.cancha} |
                       Grupo ${seguro(e.grupo)}</p>

                    <p>${seguro(nombrePareja(e.pareja1_id))}
                       VS
                       ${seguro(nombrePareja(e.pareja2_id))}</p>

                    <form class="admin-form resultado-form"
                        data-id="${e.id}">

                        <label>
                            Puntos pareja 1
                            <input type="number"
                                name="puntos1"
                                min="0"
                                value="${e.puntos1 ?? ""}"
                                required>
                        </label>

                        <label>
                            Puntos pareja 2
                            <input type="number"
                                name="puntos2"
                                min="0"
                                value="${e.puntos2 ?? ""}"
                                required>
                        </label>

                        <button class="btn" type="submit">
                            Guardar resultado
                        </button>

                        <button class="btn-delete"
                            type="button"
                            data-action="eliminar-fixture"
                            data-id="${e.id}">
                            Eliminar
                        </button>

                    </form>
                </div>
            `;
    }
    contenedor.innerHTML = `
        <div class="admin-card">
            <h2>Gestionar resultados por evento</h2>
            <div class="admin-form">
                <label>Seleccionar partido o torneo
                    <select id="resultados-partido">
                        <option value="">Seleccionar evento</option>
                        ${partidos.map(p => `<option value="${seguro(p.id)}" ${p.id === eventoResultados ? "selected" : ""}>${seguro(p.titulo)} — ${seguro(p.fecha)}</option>`).join("")}
                    </select>
                </label>
            </div>
            ${partido ? `<p>${seguro(partido.titulo)} · ${lista.length} enfrentamientos · ${lista.filter(e => e.puntos1 !== null && e.puntos2 !== null).length} con resultado</p>` : ""}
        </div>
        ${!eventoResultados ? '<div class="empty">Selecciona un evento para gestionar sus resultados.</div>' : !lista.length ? '<div class="empty">Este evento no tiene enfrentamientos registrados.</div>' : grupos.map(grupo => `
            <div class="admin-card" style="border-left:4px solid #ffda00">
                <h2 style="color:#ffda00">Grupo ${seguro(grupo)}</h2>
                <p>${lista.filter(e => (e.grupo || "General") === grupo).length} enfrentamientos</p>
            </div>
            ${lista.filter(e => (e.grupo || "General") === grupo).sort((a,b) => a.turno-b.turno || a.cancha-b.cancha).map(tarjeta).join("")}
        `).join("")}
    `;
    $("resultados-partido").addEventListener("change", e => {
        eventoResultados = e.target.value;
        mostrarEnfrentamientos();
    });

    document.querySelectorAll(".resultado-form")
        .forEach(f => {
            f.addEventListener("submit", e => {
                e.preventDefault();

                ejecutar(async () => {
                    await consultar(
                        supabase.from("enfrentamientos")
                            .update({
                                puntos1: Number(f.elements.puntos1.value),
                                puntos2: Number(f.elements.puntos2.value)
                            })
                            .eq("id", f.dataset.id)
                    );

                    await cargarDatos();
                    aviso("Resultado guardado.");
                });
            });
        });
}

// RANKING BASICO

function mostrarRanking() {
    const ranking = new Map();

    function sumar(id, puntos, rival) {
        const pareja = parejas.find(p => p.id === id);
        if (!pareja) return;

        for (const nombre of [
            pareja.jugador1,
            pareja.jugador2
        ].filter(Boolean)) {

            const clave = nombre.trim().toLowerCase();

            if (!ranking.has(clave)) {
                ranking.set(clave, {
                    nombre,
                    jugados: 0,
                    ganados: 0,
                    puntos: 0
                });
            }

            const jugador = ranking.get(clave);

            jugador.jugados++;
            jugador.puntos += puntos;

            if (puntos > rival) jugador.ganados++;
        }
    }

    enfrentamientos
        .filter(e =>
            e.publicado &&
            e.puntos1 !== null &&
            e.puntos2 !== null
        )
        .forEach(e => {
            sumar(e.pareja1_id, e.puntos1, e.puntos2);
            sumar(e.pareja2_id, e.puntos2, e.puntos1);
        });

    const lista = [...ranking.values()].sort(
        (a, b) => b.ganados - a.ganados ||
                  b.puntos - a.puntos
    );

    $("admin-ranking").innerHTML = lista.length ? `
        <div class="admin-card">
            <table>
                <thead>
                    <tr>
                        <th>Posición</th>
                        <th>Jugador</th>
                        <th>Jugados</th>
                        <th>Ganados</th>
                        <th>Puntos</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map((j, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${seguro(j.nombre)}</td>
                            <td>${j.jugados}</td>
                            <td>${j.ganados}</td>
                            <td>${j.puntos}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    ` : '<div class="empty">Todavía no hay resultados.</div>';
}

// PRODUCTOS

function mostrarProductos() {
    $("admin-lista-productos").innerHTML =
        productos.length ? productos.map(p => `
            <div class="admin-item">
                <div>
                    <h3>${seguro(p.nombre)}</h3>
                    <p>$${Number(p.precio).toFixed(2)}</p>
                    <p>${p.disponible ? "Disponible" : "Agotado"}</p>
                    <p>${p.publicado ? "Publicado" : "Oculto"}</p>
                </div>

                <div class="actions">
                    <button class="btn-edit"
                        data-action="editar-producto"
                        data-id="${p.id}">
                        Editar
                    </button>

                    <button class="btn-delete"
                        data-action="eliminar-producto"
                        data-id="${p.id}">
                        Eliminar
                    </button>
                </div>
            </div>
        `).join("") :
        '<div class="empty">No hay productos registrados.</div>';
}

$("producto-form").addEventListener("submit", e => {
    e.preventDefault();
    const f = e.currentTarget;

    ejecutar(async () => {
        const id = f.elements.id.value;

        const imagen = f.elements.imagen.value.trim();

        if (imagen && new URL(imagen).protocol !== "https:") {
            throw new Error("La imagen debe utilizar HTTPS.");
        }

        const datos = {
            nombre: f.elements.nombre.value.trim(),
            categoria_id: f.elements.categoria_id.value || null,
            precio: Number(f.elements.precio.value),
            imagen,
            descripcion: f.elements.descripcion.value.trim(),
            disponible: f.elements.disponible.checked,
            publicado: f.elements.publicado.checked,
            destacado: f.elements.destacado.checked
        };

        if (id) {
            await consultar(
                supabase.from("productos")
                    .update(datos).eq("id", id)
            );
        } else {
            await consultar(
                supabase.from("productos").insert(datos)
            );
        }

        f.reset();
        f.elements.id.value = "";

        await cargarDatos();
        aviso("Producto guardado correctamente.");
    });
});

function editarProducto(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;

    const f = $("producto-form");

    for (const campo of [
        "id", "nombre", "categoria_id",
        "precio", "imagen", "descripcion"
    ]) {
        f.elements[campo].value = p[campo] ?? "";
    }

    for (const campo of [
        "disponible", "publicado", "destacado"
    ]) {
        f.elements[campo].checked = p[campo];
    }

    mostrarSeccion("productos");
    f.scrollIntoView({ behavior: "smooth" });
}

// CATEGORIAS

function mostrarCategorias() {
    $("admin-lista-categorias").innerHTML =
        categorias.map(c => `
            <div class="admin-item">
                <strong>${seguro(c.nombre)}</strong>

                <button class="btn-delete"
                    data-action="eliminar-categoria"
                    data-id="${c.id}">
                    Eliminar
                </button>
            </div>
        `).join("");
}

$("categoria-form").addEventListener("submit", e => {
    e.preventDefault();
    const f = e.currentTarget;

    ejecutar(async () => {
        await consultar(
            supabase.from("categorias").insert({
                nombre: f.elements.nombre.value.trim()
            })
        );

        f.reset();
        await cargarDatos();
        aviso("Categoría creada.");
    });
});

// CONFIGURACION

function mostrarConfiguracion() {
    const f = $("configuracion-form");

    f.elements.whatsapp.value =
        configuracion.whatsapp || "";

    f.elements.direccion.value =
        configuracion.direccion || "";
}

$("configuracion-form").addEventListener("submit", e => {
    e.preventDefault();
    const f = e.currentTarget;

    ejecutar(async () => {
        const whatsapp = f.elements.whatsapp.value
            .replace(/\D/g, "");

        if (whatsapp && !/^[1-9]\d{7,14}$/.test(whatsapp)) {
            throw new Error("Número de WhatsApp no válido.");
        }

        await consultar(
            supabase.from("configuracion")
                .update({
                    whatsapp,
                    direccion: f.elements.direccion.value.trim()
                })
                .eq("id", 1)
        );

        await cargarDatos();
        aviso("Configuración guardada.");
    });
});

// BOTONES DE ADMINISTRACION

document.addEventListener("click", e => {
    const boton = e.target.closest("[data-action]");
    if (!boton) return;

    const id = boton.dataset.id;

    ejecutar(async () => {
        switch (boton.dataset.action) {

            case "editar-partido":
                editarPartido(id);
                break;

            case "eliminar-partido":
                await eliminarPartido(id);
                break;

            case "eliminar-pareja":
                await eliminarPareja(id);
                break;

            case "editar-producto":
                editarProducto(id);
                break;

            case "eliminar-producto":
                if (!confirm("¿Eliminar este producto?")) return;

                await consultar(
                    supabase.from("productos")
                        .delete().eq("id", id)
                );

                await cargarDatos();
                aviso("Producto eliminado.");
                break;

            case "eliminar-categoria":
                if (!confirm("¿Eliminar esta categoría?")) return;

                await consultar(
                    supabase.from("categorias")
                        .delete().eq("id", id)
                );

                await cargarDatos();
                aviso("Categoría eliminada.");
                break;

            case "eliminar-fixture":
                if (!confirm(
                    "¿Eliminar este enfrentamiento y su resultado?"
                )) return;

                await consultar(
                    supabase.from("enfrentamientos")
                        .delete().eq("id", id)
                );

                await cargarDatos();
                aviso("Enfrentamiento eliminado.");
                break;
        }
    });
});

// INICIAR PANEL

ejecutar(verificarSesion);




