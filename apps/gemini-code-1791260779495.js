import React from 'react';
import { 
  LayoutDashboard, 
  Boxes, 
  Truck, 
  MapPin, 
  Building2, 
  Settings, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  Bell, 
  User 
} from 'lucide-react';

export default function MalhaXDashboard() {
  return (
    <div className="flex h-screen bg-[#0F172A] text-[#F8FAFC] font-sans overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#1E293B] border-r border-slate-800 flex flex-col justify-between">
        <div>
          {/* Logo do App */}
          <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
            <div className="bg-gradient-to-tr from-blue-600 to-orange-500 p-2 rounded-lg text-white font-bold text-lg">
              MX
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-wide text-white">MalhaX</h1>
              <span className="text-xs text-slate-400">Logística Universal</span>
            </div>
          </div>

          {/* Menu de Navegação */}
          <nav className="p-4 space-y-1">
            <a href="#" className="flex items-center space-x-3 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium shadow-lg shadow-blue-600/20">
              <LayoutDashboard size={20} />
              <span>Dashboard Matriz</span>
            </a>
            <a href="#" className="flex items-center space-x-3 px-4 py-3 text-slate-400 hover:bg-slate-800 hover:text-white rounded-lg transition">
              <Boxes size={20} />
              <span>Gestão de Estoques</span>
            </a>
            <a href="#" className="flex items-center space-x-3 px-4 py-3 text-slate-400 hover:bg-slate-800 hover:text-white rounded-lg transition">
              <Truck size={20} />
              <span>Frota & Transportes</span>
            </a>
            <a href="#" className="flex items-center space-x-3 px-4 py-3 text-slate-400 hover:bg-slate-800 hover:text-white rounded-lg transition">
              <Building2 size={20} />
              <span>Subempresas</span>
            </a>
            <a href="#" className="flex items-center space-x-3 px-4 py-3 text-slate-400 hover:bg-slate-800 hover:text-white rounded-lg transition">
              <MapPin size={20} />
              <span>Rotas Globais</span>
            </a>
          </nav>
        </div>

        {/* Rodapé da Sidebar */}
        <div className="p-4 border-t border-slate-800">
          <a href="#" className="flex items-center space-x-3 px-4 py-3 text-slate-400 hover:text-white transition">
            <Settings size={20} />
            <span>Configurações</span>
          </a>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        
        {/* Header Superior */}
        <header className="h-16 bg-[#1E293B]/50 backdrop-blur border-b border-slate-800 flex items-center justify-between px-8">
          <div className="flex items-center space-x-4 bg-slate-900/60 px-4 py-2 rounded-lg border border-slate-800 w-96">
            <Search size={18} className="text-slate-400" />
            <input 
              type="text" 
              placeholder="Pesquisar rotas, filiais ou códigos de estoque..." 
              className="bg-transparent border-none outline-none text-sm text-white w-full placeholder-slate-500"
            />
          </div>

          <div className="flex items-center space-x-4">
            <button className="relative p-2 text-slate-400 hover:text-white bg-slate-800/50 rounded-full">
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full"></span>
            </button>
            <div className="flex items-center space-x-3 pl-4 border-l border-slate-800">
              <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center font-bold text-white">
                MX
              </div>
              <div>
                <p className="text-sm font-medium text-white">Central Operacional</p>
                <p className="text-xs text-slate-400">Matriz Principal</p>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Workspace */}
        <div className="p-8 grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* Coluna Central: Mapa e Rotas (Ocupa 2 colunas) */}
          <div className="xl:col-span-2 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-white">Monitoramento de Malha Nacional</h2>
                <p className="text-sm text-slate-400">Acompanhamento em tempo real do fluxo entre matriz e subempresas.</p>
              </div>
              <span className="bg-emerald-500/10 text-emerald-400 text-xs px-3 py-1 rounded-full border border-emerald-500/20 font-medium">
                ● Sistema Operando 100%
              </span>
            </div>

            {/* Card do Mapa Estilizado */}
            <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 relative h-[420px] flex flex-col justify-between shadow-xl">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] rounded-2xl pointer-events-none"></div>
              
              <div className="flex justify-between items-center z-10">
                <div className="bg-slate-900/80 backdrop-blur px-4 py-2 rounded-lg border border-slate-800 text-xs text-slate-300">
                  Filtro Ativo: <span className="text-white font-semibold">Todas as Regiões</span>
                </div>
                <div className="flex space-x-2">
                  <span className="flex items-center text-xs text-slate-400"><span className="w-2 h-2 bg-orange-500 rounded-full mr-1.5"></span> Em Trânsito</span>
                  <span className="flex items-center text-xs text-slate-400"><span className="w-2 h-2 bg-emerald-500 rounded-full mr-1.5"></span> Entregue</span>
                </div>
              </div>

              {/* Simulação Visual do Mapa / Rotas */}
              <div className="flex items-center justify-center my-auto z-10">
                <div className="text-center space-y-2">
                  <div className="inline-block p-4 bg-blue-600/20 border border-blue-500/30 rounded-2xl text-blue-400 animate-pulse">
                    <Truck size={36} />
                  </div>
                  <p className="text-sm font-medium text-slate-300">Carregando telemetria das subempresas...</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 z-10 pt-4 border-t border-slate-800/60">
                <div>
                  <p className="text-xs text-slate-400">Rotas Ativas</p>
                  <p className="text-lg font-bold text-white">1.482</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Tempo Médio</p>
                  <p className="text-lg font-bold text-white">42 min</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Eficiência da Malha</p>
                  <p className="text-lg font-bold text-emerald-400">98.4%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna Lateral: Alertas e Status de Subempresas */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-white">Subempresas & Alertas</h3>
            
            {/* Card Subempresa A */}
            <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-slate-700 transition">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs text-orange-400 font-semibold uppercase tracking-wider">Filial Sudeste</span>
                  <h4 className="font-bold text-white text-base">Transportadora LogiFlex</h4>
                </div>
                <span className="bg-orange-500/10 text-orange-400 text-xs px-2.5 py-1 rounded-md border border-orange-500/20">
                  Em Trânsito
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-orange-500 h-full w-[75%]"></div>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Capacidade do Armazém</span>
                <span className="text-white font-medium">75% Ocupado</span>
              </div>
            </div>

            {/* Card Subempresa B */}
            <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-slate-700 transition">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Filial Sul</span>
                  <h4 className="font-bold text-white text-base">Armazém Central SP</h4>
                </div>
                <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2.5 py-1 rounded-md border border-emerald-500/20">
                  Liberado
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full w-[45%]"></div>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Capacidade do Armazém</span>
                <span className="text-white font-medium">45% Ocupado</span>
              </div>
            </div>

            {/* Alerta Crítico / Aviso */}
            <div className="bg-gradient-to-r from-orange-500/10 to-transparent border-l-4 border-orange-500 p-4 rounded-r-2xl space-y-1">
              <div className="flex items-center space-x-2 text-orange-400 font-semibold text-sm">
                <AlertTriangle size={16} />
                <span>Atenção na Malha</span>
              </div>
              <p className="text-xs text-slate-300">
                Reposição pendente no setor de inventário da subempresa Alfa. Verifique o painel de estoques.
              </p>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}