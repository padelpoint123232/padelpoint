

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
        '<div class="empty">No hay quedadas registradas.</div>';
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
        aviso("Quedada guardada correctamente.");
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
        "¿Eliminar permanentemente esta quedada, sus inscritos, resultados y final? No se puede deshacer."
    )) return;

    await consultar(
        supabase.from("partidos").delete().eq("id", id)
    );

    await cargarDatos();
    aviso("Quedada eliminada.");
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
            <option value="">Seleccionar quedada</option>
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

function ganador(e) {
    if (e.puntos1 == null || e.puntos2 == null) return null;
    return e.puntos1 > e.puntos2 ? 1 : e.puntos2 > e.puntos1 ? 2 : [1,2].includes(e.punto_oro) ? e.punto_oro : null;
}
function clasificar(lista) {
    const mapa = new Map();
    for (const e of lista) {
        for (const id of [e.pareja1_id,e.pareja2_id]) if (!mapa.has(id)) mapa.set(id,{id,pj:0,pg:0,jf:0,jc:0});
        const g = ganador(e); if (!g) continue;
        for (const i of [1,2]) {
            const p=mapa.get(e[`pareja${i}_id`]); p.pj++; p.pg+=Number(g===i); p.jf+=e[`puntos${i}`]; p.jc+=e[`puntos${3-i}`];
        }
    }
    const cmp=(a,b)=>b.pg-a.pg || (b.jf-b.jc)-(a.jf-a.jc) || b.jf-a.jf;
    const filas=[...mapa.values()].sort(cmp);
    let ambiguo=false;
    for(let i=0;i<filas.length;) {
        let j=i+1; while(j<filas.length && !cmp(filas[i],filas[j])) j++;
        if(j-i===2) {
            const a=filas[i],b=filas[i+1];
            const directos=lista.filter(e=>[e.pareja1_id,e.pareja2_id].includes(a.id)&&[e.pareja1_id,e.pareja2_id].includes(b.id)&&ganador(e));
            if(directos.length===1) {const e=directos[0]; if(e[`pareja${ganador(e)}_id`]===b.id) [filas[i],filas[i+1]]=[b,a];}
            else ambiguo=true;
        } else if(j-i>2) ambiguo=true;
        i=j;
    }
    return {filas,ambiguo};
}
function mostrarEnfrentamientos() {
    const contenedor=$("admin-lista-enfrentamientos");
    const partido=partidos.find(p=>p.id===eventoResultados);
    const lista=enfrentamientos.filter(e=>e.partido_id===eventoResultados);
    const fase=lista.filter(e=>e.fase!=="final");
    const final=lista.find(e=>e.fase==="final");
    const grupos=[...new Set(fase.map(e=>e.grupo||"General"))].sort();
    const tablas=grupos.map(g=>({g,...clasificar(fase.filter(e=>(e.grupo||"General")===g))}));
    const candidatos=grupos.length===1 ? tablas[0].filas.slice(0,2) : grupos.length===2 ? tablas.map(t=>t.filas[0]) : [];
    const listo= fase.length>0 && fase.every(ganador) && candidatos.length===2 && !tablas.some(t=>t.ambiguo);
    const tarjeta=e=>`<div class="admin-card"><h3>${e.fase==="final"?"Gran final":"Turno "+e.turno} · Cancha ${e.cancha}</h3><p>${seguro(nombrePareja(e.pareja1_id))} VS ${seguro(nombrePareja(e.pareja2_id))}</p>
    <form class="admin-form resultado-form" data-id="${e.id}">
    <label>Juegos pareja 1<input type="number" name="puntos1" min="0" step="1" required value="${e.puntos1??""}"></label>
    <label>Juegos pareja 2<input type="number" name="puntos2" min="0" step="1" required value="${e.puntos2??""}"></label>
    <label>Punto de oro (solo empate)<select name="punto_oro"><option value="">Sin desempate</option><option value="1" ${e.punto_oro===1?"selected":""}>Pareja 1</option><option value="2" ${e.punto_oro===2?"selected":""}>Pareja 2</option></select></label>
    ${final&&e.fase!=="final"||partido?.estado==="finalizado"?"<p>Resultado bloqueado.</p>":`<button class="btn" type="submit">Guardar resultado</button><button class="btn-delete" type="button" data-action="eliminar-fixture" data-id="${e.id}">Eliminar</button>`}</form></div>`;
    contenedor.innerHTML=`<div class="admin-card"><h2>Resultados por quedada</h2><label>Seleccionar quedada<select id="resultados-partido"><option value="">Seleccionar quedada</option>${partidos.map(p=>`<option value="${p.id}" ${p.id===eventoResultados?"selected":""}>${seguro(p.titulo)} — ${seguro(p.fecha)}</option>`).join("")}</select></label></div>
    ${tablas.map(t=>`<div class="admin-card"><h2>Clasificación · ${seguro(t.g)}</h2><div style="overflow-x:auto"><table><thead><tr><th>Pos.</th><th>Pareja</th><th>PJ</th><th>PG</th><th>JF</th><th>JC</th><th>Dif.</th></tr></thead><tbody>${t.filas.map((p,i)=>`<tr><td>${i+1}</td><td>${seguro(nombrePareja(p.id))}</td><td>${p.pj}</td><td>${p.pg}</td><td>${p.jf}</td><td>${p.jc}</td><td>${p.jf-p.jc}</td></tr>`).join("")}</tbody></table></div></div>${fase.filter(e=>(e.grupo||"General")===t.g).map(tarjeta).join("")}`).join("")}
    ${partido&&fase.length&&!final?`<div class="admin-card"><h2>Gran final</h2><p>${listo?candidatos.map(p=>seguro(nombrePareja(p.id))).join(" VS "):fase.every(ganador)?"Empate de clasificación sin resolver. No se elegirá al azar.":"Completa todos los resultados y desempates."}</p><label>Cancha <input id="final-cancha" type="number" min="1" max="${partido.canchas}" value="1"></label><button class="btn" id="generar-final" ${listo&&partido.estado==="cerrado"?"":"disabled"}>Generar final</button></div>`:""}
    ${final?tarjeta(final):""}
    ${final&&ganador(final)?`<div class="admin-card"><h2>🏆 Campeones de la quedada</h2><p>${seguro(nombrePareja(final[`pareja${ganador(final)}_id`]))}</p><p>Subcampeones: ${seguro(nombrePareja(final[`pareja${3-ganador(final)}_id`]))}</p>${partido.estado!=="finalizado"?'<button class="btn" id="finalizar-quedada">Finalizar quedada</button>':'<p>Quedada finalizada</p>'}</div>`:""}
    ${partido?`<button class="btn-delete" data-action="eliminar-partido" data-id="${partido.id}">Eliminar quedada</button>`:""}`;
    $("resultados-partido").onchange=e=>{eventoResultados=e.target.value;mostrarEnfrentamientos();};
    $("generar-final")?.addEventListener("click",()=>ejecutar(async()=>{
        const boton=$("generar-final"); boton.disabled=true;
        try {
            const cancha=Number($("final-cancha").value);
            if(!listo||!Number.isInteger(cancha)||cancha<1||cancha>partido.canchas) throw Error("Cancha o clasificación no válida.");
            await consultar(supabase.from("enfrentamientos").insert({partido_id:partido.id,pareja1_id:candidatos[0].id,pareja2_id:candidatos[1].id,grupo:"Final",fase:"final",turno:Math.max(...fase.map(e=>e.turno))+1,cancha,publicado:true}));
            await cargarDatos(); aviso("Final publicada.");
        } finally {boton.disabled=false;}
    }));
    $("finalizar-quedada")?.addEventListener("click",()=>ejecutar(async()=>{
        if(!confirm("¿Finalizar la quedada?")) return;
        await consultar(supabase.from("partidos").update({estado:"finalizado"}).eq("id",partido.id)); await cargarDatos(); aviso("Quedada finalizada.");
    }));
    contenedor.querySelectorAll(".resultado-form").forEach(f=>f.onsubmit=e=>{
        e.preventDefault(); ejecutar(async()=>{
            const actual=lista.find(x=>x.id===f.dataset.id);
            if(partido.estado==="finalizado"||final&&actual.fase!=="final") throw Error("Resultado bloqueado.");
            const puntos1=Number(f.elements.puntos1.value),puntos2=Number(f.elements.puntos2.value);
            const punto_oro=puntos1===puntos2?Number(f.elements.punto_oro.value):null;
            if(!Number.isInteger(puntos1)||!Number.isInteger(puntos2)||puntos1<0||puntos2<0) throw Error("Marcador inválido.");
            if(puntos1===puntos2&&![1,2].includes(punto_oro)) throw Error("Selecciona quién ganó el punto de oro.");
            await consultar(supabase.from("enfrentamientos").update({puntos1,puntos2,punto_oro}).eq("id",actual.id)); await cargarDatos(); aviso("Resultado guardado.");
        });
    });
}

// RANKING BASICO

function mostrarRanking() {
    const ranking = new Map();

    function sumar(id, puntos, victoria) {
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

            if (victoria) jugador.ganados++;
        }
    }

    enfrentamientos
        .filter(e =>
            e.publicado &&
            e.puntos1 !== null &&
            e.puntos2 !== null && ganador(e)
        )
        .forEach(e => {
            sumar(e.pareja1_id, e.puntos1, ganador(e) === 1);
            sumar(e.pareja2_id, e.puntos2, ganador(e) === 2);
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
                { const actual=enfrentamientos.find(x=>x.id===id); if(!actual || partidos.find(p=>p.id===actual.partido_id)?.estado==="finalizado" || actual.fase!=="final" && enfrentamientos.some(x=>x.partido_id===actual.partido_id&&x.fase==="final")) throw Error("Enfrentamiento bloqueado."); }
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




